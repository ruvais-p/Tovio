import { createHmac, timingSafeEqual } from "node:crypto";

export class AccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Membership {
  iss: "excalidraw-room";
  aud: "excalidraw-media";
  room: string;
  sub: string;
  exp: number;
  jti: string;
}

export function secureEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyMembership(
  token: unknown,
  secret: string,
  now = Date.now(),
): Membership {
  if (typeof token !== "string" || token.length > 2048) {
    throw new AccessError(401, "Invalid membership attestation");
  }
  const [payload, signature, extra] = token.split(".");
  const expected = createHmac("sha256", secret)
    .update(payload || "")
    .digest("base64url");
  if (!payload || !signature || extra || !secureEqual(signature, expected)) {
    throw new AccessError(401, "Invalid membership attestation");
  }
  let claims: Membership;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    throw new AccessError(401, "Invalid membership attestation");
  }
  if (
    !claims ||
    claims.iss !== "excalidraw-room" ||
    claims.aud !== "excalidraw-media" ||
    typeof claims.room !== "string" ||
    typeof claims.sub !== "string" ||
    typeof claims.jti !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(claims.room) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(claims.sub) ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(claims.jti) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= now / 1000 ||
    claims.exp > now / 1000 + 65
  ) {
    throw new AccessError(401, "Expired or invalid membership attestation");
  }
  return claims;
}

/** Single API replica; the SFU also enforces maxParticipants across admission races. */
export class Admission {
  private used = new Map<string, number>();
  private reservations = new Map<string, Map<string, number>>();
  private locks = new Map<string, Promise<void>>();

  consume(claims: Membership, now = Date.now()) {
    for (const [id, expiry] of this.used) {
      if (expiry <= now) {
        this.used.delete(id);
      }
    }
    if (this.used.has(claims.jti)) {
      throw new AccessError(401, "Membership attestation already exchanged");
    }
    if (this.used.size >= 10000) {
      throw new AccessError(503, "Media access is busy. Try again shortly.");
    }
    this.used.set(claims.jti, claims.exp * 1000);
  }

  async serialized<T>(room: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(room) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(room, lock);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(room) === lock) {
        this.locks.delete(room);
      }
    }
  }

  reserve(
    room: string,
    identity: string,
    members: string[],
    capacity: number,
    now = Date.now(),
  ) {
    this.prune(now);
    const pending = this.reservations.get(room) ?? new Map<string, number>();
    const occupied = new Set([...members, ...pending.keys()]);
    if (occupied.has(identity)) {
      throw new AccessError(
        409,
        "Media is already connected or connecting. Retry shortly.",
      );
    }
    if (occupied.size >= capacity) {
      throw new AccessError(409, "This call is full. You can still draw.");
    }
    pending.set(identity, now + 60000);
    this.reservations.set(room, pending);
  }

  prune(now = Date.now()) {
    for (const [room, pending] of this.reservations) {
      for (const [id, expiry] of pending) {
        if (expiry <= now) {
          pending.delete(id);
        }
      }
      if (!pending.size) {
        this.reservations.delete(room);
      }
    }
  }

  release(room: string, identity: string) {
    this.reservations.get(room)?.delete(identity);
  }
}

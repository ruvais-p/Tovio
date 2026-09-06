import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import http from "http";
import https from "https";

import type { Express } from "express";
import type { Server, Socket } from "socket.io";

const encode = (value: Buffer) =>
  value
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export function attestMembership(
  secret: string,
  room: string,
  identity: string,
  now = Date.now(),
) {
  const payload = encode(
    Buffer.from(
      JSON.stringify({
        iss: "excalidraw-room",
        aud: "excalidraw-media",
        room,
        sub: identity,
        exp: Math.floor(now / 1000) + 60,
        jti: encode(randomBytes(24)),
      }),
    ),
  );
  return `${payload}.${encode(
    createHmac("sha256", secret).update(payload).digest(),
  )}`;
}

export function installMediaBridge(
  app: Express,
  io: Server,
  env = process.env,
) {
  const secret = env.MEDIA_MEMBERSHIP_SECRET;
  if (!secret) {
    return { connected: (_socket: Socket) => {} };
  }
  if (secret.length < 32 || !env.MEDIA_API_INTERNAL_URL) {
    throw new Error(
      "Media requires MEDIA_MEMBERSHIP_SECRET (32+ characters) and MEDIA_API_INTERNAL_URL",
    );
  }
  const departureUrl = new URL(
    "/internal/departure",
    env.MEDIA_API_INTERNAL_URL,
  );
  if (!["http:", "https:"].includes(departureUrl.protocol)) {
    throw new Error("Invalid MEDIA_API_INTERNAL_URL");
  }
  const departed = new Map<string, number>();
  const current = (room: string, identity: string) => {
    const socket = io.sockets.sockets.get(identity);
    return (
      !!socket?.connected &&
      socket.data.mediaRoom === room &&
      socket.rooms.has(room)
    );
  };
  app.get("/internal/media-membership", (req, res) => {
    const actual = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(new Uint8Array(actual), new Uint8Array(expected))
    ) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { room, identity } = req.query;
    if (typeof room !== "string" || typeof identity !== "string") {
      res.status(400).json({ error: "Invalid membership" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    const now = Date.now();
    for (const [key, expiry] of Array.from(departed)) {
      if (expiry <= now) {
        departed.delete(key);
      }
    }
    res.json({
      member:
        current(room, identity) ||
        (req.query.grace === "1" &&
          (departed.get(`${room}:${identity}`) || 0) > now),
    });
  });
  const notify = (room: string, identity: string) => {
    const request = (departureUrl.protocol === "https:" ? https : http).request(
      departureUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        timeout: 4000,
      },
      (response) => response.resume(),
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => {
      /* Media API reconciles departures if this notification fails. */
    });
    request.end(JSON.stringify({ room, identity }));
  };
  return {
    connected(socket: Socket) {
      let lastAttestation = 0;
      let messages = 0;
      let windowStart = Date.now();
      socket.on("media-attestation", (room: unknown, reply: unknown) => {
        if (typeof reply !== "function") {
          return;
        }
        if (
          typeof room !== "string" ||
          !current(room, socket.id) ||
          Date.now() - lastAttestation < 1000
        ) {
          reply({
            error:
              "Media requires a connected collaboration session. Try again shortly.",
          });
          return;
        }
        lastAttestation = Date.now();
        reply({ attestation: attestMembership(secret, room, socket.id) });
      });
      socket.on("media-state", (room: unknown, data: unknown, iv: unknown) => {
        if (Date.now() - windowStart > 1000) {
          messages = 0;
          windowStart = Date.now();
        }
        if (
          ++messages > 10 ||
          typeof room !== "string" ||
          !current(room, socket.id) ||
          !Buffer.isBuffer(data) ||
          data.length > 4096 ||
          !Buffer.isBuffer(iv) ||
          iv.length !== 12
        ) {
          return;
        }
        // Sender is socket-derived; clients cannot claim another participant's identity.
        socket.broadcast.to(room).emit("media-state", socket.id, data, iv);
      });
      socket.on("media-leave", () => {
        const room = socket.data.mediaRoom;
        if (room) {
          socket.data.mediaRoom = null;
          notify(room, socket.id);
        }
      });
      socket.on("disconnecting", () => {
        const room = socket.data.mediaRoom;
        if (!room) {
          return;
        }
        if (departed.size < 10000) {
          departed.set(`${room}:${socket.id}`, Date.now() + 5000);
        }
        const timer = setTimeout(() => {
          departed.delete(`${room}:${socket.id}`);
          notify(room, socket.id);
        }, 5000);
        timer.unref();
      });
    },
  };
}

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AccessError,
  Admission,
  secureEqual,
  verifyMembership,
} from "./access.js";
import type { Config } from "./config.js";

export interface MediaBackend {
  ensureRoom(room: string, capacity: number): Promise<void>;
  participants(room: string): Promise<string[]>;
  rooms(): Promise<string[]>;
  remove(room: string, identity: string): Promise<void>;
  token(room: string, identity: string): Promise<string>;
}

async function readBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of req) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > 4096) {
      throw new AccessError(413, "Request too large");
    }
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error();
    }
    return value;
  } catch {
    throw new AccessError(400, "Invalid JSON body");
  }
}

export function createMediaServer(
  config: Config,
  backend: MediaBackend,
  member: (
    room: string,
    identity: string,
    allowGrace?: boolean,
  ) => Promise<boolean>,
) {
  const admission = new Admission();
  const rates = new Map<string, { count: number; expires: number }>();
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Origin");
    try {
      const path = new URL(req.url || "/", "http://localhost").pathname;
      if (path === "/healthz" && req.method === "GET") {
        return json(res, 200, { status: "ok" });
      }
      if (path === "/readyz" && req.method === "GET") {
        await backend.rooms();
        return json(res, 200, { status: "ready" });
      }
      if (path === "/internal/departure" && req.method === "POST") {
        if (
          !secureEqual(
            req.headers.authorization || "",
            `Bearer ${config.membershipSecret}`,
          )
        ) {
          throw new AccessError(401, "Unauthorized");
        }
        const body = await readBody(req);
        if (
          typeof body.room !== "string" ||
          typeof body.identity !== "string"
        ) {
          throw new AccessError(400, "Invalid departure");
        }
        await backend.remove(body.room, body.identity);
        admission.release(body.room, body.identity);
        return json(res, 200, { ok: true });
      }
      if (path !== "/v1/media/token") {
        throw new AccessError(404, "Not found");
      }
      const origin = req.headers.origin;
      if (!origin || !config.origins.has(origin)) {
        throw new AccessError(403, "Origin not allowed");
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "POST");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== "POST") {
        throw new AccessError(405, "Method not allowed");
      }
      const now = Date.now();
      for (const [ip, rate] of rates) {
        if (rate.expires <= now) {
          rates.delete(ip);
        }
      }
      // Deliberately ignore spoofable X-Forwarded-For. Configure edge limits too.
      const ip = req.socket.remoteAddress || "unknown";
      const rate = rates.get(ip) ?? { count: 0, expires: now + 60000 };
      if (++rate.count > 120 || rates.size >= 10000) {
        throw new AccessError(
          429,
          "Too many media requests. Try again shortly.",
        );
      }
      rates.set(ip, rate);
      const body = await readBody(req);
      if (Object.keys(body).some((key) => key !== "attestation")) {
        throw new AccessError(400, "Only a membership attestation is accepted");
      }
      const claims = verifyMembership(
        body.attestation,
        config.membershipSecret,
      );
      admission.consume(claims);
      if (!(await member(claims.room, claims.sub))) {
        throw new AccessError(
          403,
          "Collaboration session is no longer connected",
        );
      }
      const token = await admission.serialized(claims.room, async () => {
        await backend.ensureRoom(claims.room, config.capacity);
        admission.reserve(
          claims.room,
          claims.sub,
          await backend.participants(claims.room),
          config.capacity,
        );
        try {
          return await backend.token(claims.room, claims.sub);
        } catch (error) {
          admission.release(claims.room, claims.sub);
          throw error;
        }
      });
      json(res, 200, { token, url: config.publicUrl, identity: claims.sub });
    } catch (error) {
      // Never log request bodies, headers, SDK errors, or bearer credentials.
      json(res, error instanceof AccessError ? error.status : 503, {
        error:
          error instanceof AccessError
            ? error.message
            : "Media service unavailable. You can still draw.",
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  let reconciling = false;
  const timer = setInterval(async () => {
    if (reconciling) {
      return;
    }
    reconciling = true;
    admission.prune();
    try {
      for (const room of await backend.rooms()) {
        for (const identity of await backend.participants(room)) {
          if (!(await member(room, identity, true))) {
            await backend.remove(room, identity);
            admission.release(room, identity);
          }
        }
      }
    } catch {
      /* Fail closed for new tokens; keep established calls on transient upstream failure. */
    } finally {
      reconciling = false;
    }
  }, 15000);
  timer.unref();
  server.on("close", () => clearInterval(timer));
  return server;
}

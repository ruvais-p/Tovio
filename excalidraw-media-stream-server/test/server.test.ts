import assert from "node:assert/strict";
import { test } from "node:test";
import { createMediaServer } from "../src/server.js";
import type { MediaBackend } from "../src/server.js";
import { attestMembership } from "../../excalidraw-room-server/src/media.js";

test("HTTP media access enforces membership, scope, origins and redacts errors", async () => {
  const secret = "test-membership-secret-of-32-characters";
  const removed: string[] = [];
  const backend: MediaBackend = {
    ensureRoom: async () => {},
    participants: async () => [],
    rooms: async () => [],
    remove: async (room, id) => {
      removed.push(`${room}:${id}`);
    },
    token: async (room, identity) => `${room}:${identity}:scoped-token`,
  };
  const server = createMediaServer(
    {
      port: 0,
      capacity: 25,
      origins: new Set(["http://localhost:3000"]),
      membershipSecret: secret,
      roomServerUrl: "http://unused",
      livekitUrl: "http://unused",
      publicUrl: "ws://localhost:7880",
      apiKey: "key",
      apiSecret: secret,
    },
    backend,
    async (room, id) => room === "room-a" && id !== "departed",
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (body: unknown, origin = "http://localhost:3000") =>
    fetch(`${url}/v1/media/token`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    const attestation = attestMembership(secret, "room-a", "user-a");
    const valid = await post({ attestation });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).token, "room-a:user-a:scoped-token");
    assert.equal((await post({ attestation })).status, 401);
    assert.equal(
      (
        await post({
          attestation: attestMembership(secret, "room-a", "departed"),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post({
          attestation: attestMembership(secret, "room-b", "user-b"),
        })
      ).status,
      403,
    );
    assert.equal((await post({ attestation, room: "other" })).status, 400);
    assert.equal(
      (await post({ attestation }, "https://evil.example")).status,
      403,
    );
    assert.equal(
      (await fetch(`${url}/internal/departure`, { method: "POST", body: "{}" }))
        .status,
      401,
    );
    const departure = await fetch(`${url}/internal/departure`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ room: "room-a", identity: "user-a" }),
    });
    assert.equal(departure.status, 200);
    assert.deepEqual(removed, ["room-a:user-a"]);
    backend.token = async () => {
      throw new Error("SDK secret must not escape");
    };
    const failed = await post({
      attestation: attestMembership(secret, "room-a", "user-c"),
    });
    assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /SDK secret/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

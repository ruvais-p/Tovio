import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { Admission, verifyMembership } from "../src/access.js";
import { readConfig } from "../src/config.js";
import { attestMembership } from "../../excalidraw-room-server/src/media.js";

const secret = "test-membership-secret-of-32-characters";

test("verifies room-server attestations and rejects tampering, expiry and bad claims", () => {
  const token = attestMembership(secret, "room-a", "participant-a");
  assert.equal(verifyMembership(token, secret).room, "room-a");
  assert.throws(() => verifyMembership(`${token}x`, secret));
  assert.throws(() => verifyMembership(token, "wrong-secret"));
  assert.throws(() => verifyMembership(token, secret, Date.now() + 61000));
  const claims = verifyMembership(token, secret);
  const payload = Buffer.from(
    JSON.stringify({ ...claims, room: undefined }),
  ).toString("base64url");
  assert.throws(() =>
    verifyMembership(
      `${payload}.${createHmac("sha256", secret)
        .update(payload)
        .digest("base64url")}`,
      secret,
    ),
  );
});

test("single-use exchange rejects replay", () => {
  const admission = new Admission();
  const claims = verifyMembership(
    attestMembership(secret, "room", "user"),
    secret,
  );
  admission.consume(claims);
  assert.throws(() => admission.consume(claims), /already exchanged/);
});

test("concurrent admission reserves exactly the configured capacity", async () => {
  const admission = new Admission();
  const results = await Promise.allSettled(
    Array.from({ length: 30 }, (_, i) =>
      admission.serialized("room", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        admission.reserve("room", `user-${i}`, [], 25, 1000);
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 25);
  admission.reserve("another-room", "user-0", [], 25, 1000);
  assert.throws(
    () => admission.reserve("room", "user-0", [], 25, 1000),
    /already/,
  );
  admission.reserve("room", "next-user", [], 25, 62000);
});

test("failed serialized work releases its lock", async () => {
  const admission = new Admission();
  await assert.rejects(
    admission.serialized("room", async () => {
      throw new Error("upstream");
    }),
  );
  assert.equal(
    await admission.serialized("room", async () => "ready"),
    "ready",
  );
});

test("configuration rejects absent secrets, wildcards, and invalid capacity", () => {
  assert.throws(() => readConfig({}), /CORS_ORIGINS/);
  const env = {
    CORS_ORIGINS: "https://draw.example.com",
    MEDIA_MEMBERSHIP_SECRET: secret,
    ROOM_SERVER_URL: "http://localhost:3002",
    LIVEKIT_URL: "http://localhost:7880",
    LIVEKIT_PUBLIC_URL: "wss://media.example.com",
    LIVEKIT_API_KEY: "key",
    LIVEKIT_API_SECRET: secret,
  };
  assert.equal(readConfig(env).capacity, 25);
  assert.throws(() => readConfig({ ...env, CORS_ORIGINS: "*" }));
  assert.throws(() => readConfig({ ...env, MEDIA_MEMBERSHIP_SECRET: "short" }));
  assert.throws(() => readConfig({ ...env, MEDIA_ROOM_CAPACITY: "10" }));
});

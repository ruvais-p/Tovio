import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { readConfig } from "./config.js";
import { createMediaServer } from "./server.js";

const config = readConfig();
const rooms = new RoomServiceClient(
  config.livekitUrl,
  config.apiKey,
  config.apiSecret,
);
const server = createMediaServer(
  config,
  {
    ensureRoom: async (name, maxParticipants) => {
      await rooms.createRoom({
        name,
        maxParticipants,
        emptyTimeout: 60,
        departureTimeout: 20,
      });
    },
    participants: async (room) =>
      (await rooms.listParticipants(room)).map((p) => p.identity),
    rooms: async () => (await rooms.listRooms()).map((r) => r.name),
    remove: async (room, identity) => {
      try {
        await rooms.removeParticipant(room, identity);
      } catch (error) {
        if ((error as { status?: number }).status !== 404) {
          throw error;
        }
      }
    },
    token: async (room, identity) => {
      const token = new AccessToken(config.apiKey, config.apiSecret, {
        identity,
        ttl: 60,
      });
      token.addGrant({
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      });
      return token.toJwt();
    },
  },
  async (room, identity, allowGrace) => {
    const url = new URL("/internal/media-membership", config.roomServerUrl);
    url.searchParams.set("room", room);
    url.searchParams.set("identity", identity);
    if (allowGrace) {
      url.searchParams.set("grace", "1");
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.membershipSecret}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      throw new Error("Membership service unavailable");
    }
    return ((await response.json()) as { member: boolean }).member === true;
  },
);
server.listen(config.port, "0.0.0.0", () =>
  console.info(`Media access listening on port ${config.port}`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

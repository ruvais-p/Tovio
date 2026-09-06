export interface Config {
  port: number;
  origins: Set<string>;
  membershipSecret: string;
  roomServerUrl: string;
  livekitUrl: string;
  publicUrl: string;
  apiKey: string;
  apiSecret: string;
  capacity: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (key: string, min = 1) => {
    const value = env[key]?.trim();
    if (!value || value.length < min) {
      throw new Error(`${key} must be configured (${min}+ characters)`);
    }
    return value;
  };
  const url = (key: string, protocols: string[]) => {
    const value = required(key);
    const parsed = new URL(value);
    if (
      !protocols.includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      throw new Error(
        `${key} must be a valid service URL without credentials or fragments`,
      );
    }
    return value.replace(/\/$/, "");
  };
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${key} must be between ${min} and ${max}`);
    }
    return value;
  };
  const origins = required("CORS_ORIGINS")
    .split(",")
    .map((origin) => origin.trim());
  for (const origin of origins) {
    if (new URL(origin).origin !== origin || !/^https?:/.test(origin)) {
      throw new Error("CORS_ORIGINS must contain exact HTTP(S) origins");
    }
  }
  return {
    port: integer("PORT", 3003, 1, 65535),
    capacity: integer("MEDIA_ROOM_CAPACITY", 25, 11, 100),
    origins: new Set(origins),
    membershipSecret: required("MEDIA_MEMBERSHIP_SECRET", 32),
    roomServerUrl: url("ROOM_SERVER_URL", ["http:", "https:"]),
    livekitUrl: url("LIVEKIT_URL", ["http:", "https:"]),
    publicUrl: url("LIVEKIT_PUBLIC_URL", ["ws:", "wss:"]),
    apiKey: required("LIVEKIT_API_KEY"),
    apiSecret: required("LIVEKIT_API_SECRET", 32),
  };
}

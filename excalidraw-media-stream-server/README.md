# Excalidraw session media

This bundle runs the optional media access API and a self-hosted LiveKit SFU. It is independent of the drawing room server: if this bundle is stopped or the frontend media URL is unset, drawing collaboration continues without calls.

Media content is encrypted end to end in supported browsers with a key derived from the collaboration invitation key. The invitation key, derived media key, and full invitation URL never go to the room server, media API, SFU, or TURN server. LiveKit still sees routing metadata and audio levels used for speaker detection.

## Pinned components

- LiveKit Server: `v1.13.1`
- LiveKit browser client: `2.22.0` in `excalidraw-app/package.json`
- LiveKit Node server SDK: `2.18.0`
- Node container: `24.12.0-alpine`

The exact versions are intentional. Test upgrades together, including E2EE, reconnect, and forced TURN, before changing any pin.

## Network and DNS

Use two public names in production:

- `draw.example.com` for the Excalidraw frontend
- `media.example.com` for LiveKit signaling, plus `turn.example.com` for TURN

Terminate HTTPS/WSS with a reverse proxy in front of LiveKit TCP port `7880` and the media API port `3003`. Keep the media API reachable from the browser only through HTTPS. Open these host firewall ports for LiveKit:

| Port          | Protocol | Purpose                                     |
| ------------- | -------- | ------------------------------------------- |
| `7880`        | TCP      | LiveKit HTTP/WebSocket signaling behind TLS |
| `7881`        | TCP      | ICE over TCP                                |
| `50000-50100` | UDP      | WebRTC media                                |
| `3478`        | UDP      | TURN/UDP                                    |
| `5349`        | TCP      | TURN/TLS                                    |

The example uses host networking because ICE and TURN advertise host addresses and accept a UDP range. If a firewall, load balancer, or container platform remaps those ports, configure the same public addresses and ports in LiveKit and validate the advertised ICE candidates.

## Credentials and configuration

Generate two different random secrets of at least 32 characters. `MEDIA_MEMBERSHIP_SECRET` is shared only by the room server and media API. `LIVEKIT_API_SECRET` is shared only by the media API and LiveKit. Never use the collaboration invitation key for either value.

```sh
cp .env.example .env
cp livekit.example.yaml livekit.yaml
mkdir -p certs
```

Edit `.env`:

- Set `CORS_ORIGINS` to the exact comma-separated frontend origins. Wildcards are rejected.
- Set `ROOM_SERVER_URL` to the room server's internal HTTP(S) address.
- Set `LIVEKIT_URL` to LiveKit's internal HTTP(S) address.
- Set `LIVEKIT_PUBLIC_URL` to the public `wss://` signaling URL.
- Put the shared membership secret and LiveKit API credentials in their corresponding variables.
- Set `MEDIA_ROOM_CAPACITY` for the deployment. The default and example value is 25; this is a validation target, not a universal capacity claim.

Edit `livekit.yaml`:

- Make `keys` match `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
- Set the TURN domain and mount its certificate and private key as `certs/fullchain.pem` and `certs/privkey.pem`.
- Keep `room.max_participants` equal to `MEDIA_ROOM_CAPACITY`.
- Adjust the UDP range only if the firewall and configuration change together.

Do not commit `.env`, `livekit.yaml`, or certificates. They are ignored by this bundle.

## Room server integration

Configure the existing `excalidraw-room-server` process with:

```dotenv
MEDIA_MEMBERSHIP_SECRET=the-same-membership-secret-used-by-the-media-api
MEDIA_API_INTERNAL_URL=http://127.0.0.1:3003
```

When both variables are absent, the bridge is disabled. If the secret is set but incomplete, the room server fails at startup with an actionable configuration error. The internal membership and departure endpoints use the shared bearer secret; keep them on a private network and do not expose them through the public reverse proxy.

The bridge preserves Excalidraw's anonymous invitation model. Membership proves that a socket currently joined the collaboration room; it is not account authentication or host approval. Membership attestations and LiveKit grants are short-lived bearer credentials. A stolen grant can be replayed until it expires, so protect both services with TLS and keep their clocks synchronized.

## Frontend configuration

Build the frontend with both collaboration endpoints:

```dotenv
VITE_APP_WS_SERVER_URL=https://room.example.com
VITE_APP_MEDIA_SERVER_URL=https://media-api.example.com
```

`VITE_APP_MEDIA_SERVER_URL` is optional. Leave it unset to keep the drawing-only experience. The frontend fails closed when browser E2EE is unavailable: it does not publish transport-only media. Validate current desktop Chrome, Firefox, and Safari releases used by your organization; embedded browsers and older releases may lack the insertable-stream support required by LiveKit E2EE.

## Build and start

For local development, with the room server on port `3002` and Docker running,
start LiveKit and the media API watcher together with:

```sh
yarn start:dev
```

This starts the pinned LiveKit container on ports `7880`, `7881`, and
`50000-50100`, loads the development-only values from `.env.development`, accepts
the Excalidraw dev frontend at `http://localhost:3001`, and watches the API source
for changes. The LiveKit container is stopped when the command exits if the
command started it. The checked-in development credentials are intentionally
local-only and must not be used in production. Use `yarn dev` to run only the API
when LiveKit is managed separately.

Validate the rendered Compose configuration without creating local secret files:

```sh
MEDIA_ENV_FILE=.env.example docker compose config
```

Build and test the API independently:

```sh
yarn install --frozen-lockfile
yarn test
yarn build
```

After replacing every example credential/domain and installing the certificates, start the deployment:

```sh
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:3003/healthz
curl --fail http://127.0.0.1:3003/readyz
```

`healthz` reports the API process. `readyz` also checks that the LiveKit API is reachable. Missing credentials stop the API before it listens and do not print secret values.

## Deployment validation

Before enabling calls in production, record the date, host CPU/RAM, network uplink/downlink, browser names and versions, and LiveKit versions. Verify:

1. Two clients with the same invitation can exchange encrypted audio/video; a different invitation key cannot decrypt it.
2. Different collaboration rooms cannot see or hear each other.
3. Camera and microphone denial are independent, both toggles stop their capture, leaving releases devices, and reconnect preserves disabled choices.
4. Blocking UDP media forces a relay candidate over TURN/TLS or TURN/UDP on separate networks.
5. Stopping the media API or LiveKit during a call leaves drawing collaboration usable and presents a call retry state.
6. Twelve real clients join successfully, then 25 real clients on the target host. Record join failures, speaker promotion, overflow access, hidden-participant audio continuity, host CPU, and inbound/outbound bandwidth. Attempt one excess admission and confirm it rejects media only.

Do not claim a 25-participant production capacity until this run succeeds on the actual deployment. Low-resolution visible tiles, adaptive subscriptions, publisher simulcast, and dynacast reduce bandwidth, but capacity still depends on publishers, visible subscriptions, codecs, TURN use, and host/network resources.

## Rollback

Remove `VITE_APP_MEDIA_SERVER_URL` and rebuild/redeploy the frontend. The call rail and media startup are then absent while drawing collaboration continues. Stop the media bundle with your normal deployment tooling after clients drain. No drawing data migration is needed. You may then remove the two media variables from the room server and restart it.

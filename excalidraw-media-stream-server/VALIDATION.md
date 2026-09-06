# Session media validation record

## Automated integration checks

Run on 2026-09-06 using Linux 6.8 x86_64, Node 20.19.6, and Yarn 1.22.22.

| Area | Command | Result |
| --- | --- | --- |
| Frontend media ordering/layout | `yarn test:app excalidraw-app/media/layout.test.ts --watch=false` | Passed, 3 tests |
| Existing collaboration regressions | `yarn test:app excalidraw-app/tests/collab.test.tsx --watch=false` | Passed, 2 tests |
| Frontend TypeScript | `yarn test:typecheck` | Passed |
| Frontend scoped lint | `yarn eslint --max-warnings=0 excalidraw-app/media excalidraw-app/collab/Collab.tsx excalidraw-app/collab/Portal.tsx` | Passed |
| Frontend production bundle | `yarn build:app:docker` | Passed; emitted the media UI chunk and LiveKit E2EE worker |
| Media API tests | `yarn --cwd excalidraw-media-stream-server test` | Passed, 6 tests |
| Media API TypeScript build | `yarn --cwd excalidraw-media-stream-server build` | Passed |
| Room server TypeScript build | `yarn --cwd excalidraw-room-server build` | Passed |
| Room server changed-file lint | `yarn eslint --max-warnings=0 excalidraw-room-server/src/index.ts excalidraw-room-server/src/media.ts` | Passed |
| Compose rendering | `MEDIA_ENV_FILE=.env.example docker compose -f excalidraw-media-stream-server/compose.yaml config` | Passed |
| Clean media API container build | `docker --context default compose -f excalidraw-media-stream-server/compose.yaml build media-api` | Passed; installed from the frozen service lockfile and compiled in the build stage |
| Local media stack startup | `docker --context default compose -f excalidraw-media-stream-server/compose.yaml up -d` | Passed with LiveKit Server `v1.13.1`; API container reached `healthy` |
| API process health | `curl --fail http://127.0.0.1:3003/healthz` | Passed; returned `{"status":"ok"}` |
| LiveKit readiness | `curl --fail http://127.0.0.1:3003/readyz` | Passed; returned `{"status":"ready"}` |
| Drawing-only frontend | `yarn build:app:docker` and the collaboration regressions with `VITE_APP_MEDIA_SERVER_URL` unset | Passed; optional call startup stayed disabled |

The checkout contained nested `excalidraw-app/node_modules` with React 19.0.0 while the root Vitest runner used React 19.2.8. The collaboration regression command was run with that nested directory temporarily moved aside and restored immediately afterward, so the test used one React instance. Likewise, room-server lint was run with its nested dependency directory temporarily moved aside to avoid duplicate ESLint plugin discovery, then restored. No dependency directory contents were changed.

Vitest reported that its optional Vite HMR WebSocket could not bind in the sandbox. Tests still completed; the media API HTTP tests were run with local socket permission and passed.

The local Compose smoke test used ignored local credentials and a local-only LiveKit configuration with TURN disabled because no public DNS/TLS certificate was available. Both containers were healthy, `/readyz` confirmed API-to-LiveKit access, and the only startup log was `Media access listening on port 3003`; credentials were not logged. The containers and ignored local files were removed after the check. The production TURN example still requires the cross-network validation below.

## Real-client deployment checks still required

Do not treat the browser, relay, or capacity tasks as complete until the following results are captured on a real deployment.

### Target environment

Fill this in for each capacity or relay run:

| Field | Value |
| --- | --- |
| Date/time and location | Pending |
| LiveKit/server SDK/client versions | `1.13.1` / `2.18.0` / `2.22.2` |
| Host CPU | Pending (local reference host: Intel Core i5-12450H, 12 logical CPUs) |
| Host RAM | Pending (local reference host: 7.4 GiB) |
| Host uplink/downlink | Pending |
| Client devices and networks | Pending |
| Browser versions | Pending (Chrome 143.0.7499.40 is installed locally but was not used for a media run) |

### Multi-browser and E2EE matrix

Record Chrome, Firefox, and Safari versions and pass/fail evidence for:

- same-invitation encrypted audio and video;
- wrong-key decryption failure;
- different-room isolation;
- independent camera and microphone denial/toggling;
- autoplay recovery;
- leaving during permission acquisition;
- session exit and room switch cleanup; and
- reconnect without duplicate participants or re-enabling disabled devices.

### Cross-network and interruption matrix

Record the selected ICE candidate pair and relay protocol while UDP media is blocked. Verify clients on separate networks communicate through TURN, then interrupt the media API and LiveKit independently while continuing to edit the drawing.

### Capacity matrix

Run 12 real clients, then 25 real clients, on the documented target host/network. For each run, record:

| Metric                                  | 12 clients | 25 clients |
| --------------------------------------- | ---------- | ---------- |
| Successful joins / attempted joins      | Pending    | Pending    |
| Join failures and reason                | Pending    | Pending    |
| Peak/steady host CPU                    | Pending    | Pending    |
| Peak/steady inbound bandwidth           | Pending    | Pending    |
| Peak/steady outbound bandwidth          | Pending    | Pending    |
| Hidden participant audio continuity     | Pending    | Pending    |
| Speaker promotion and overflow behavior | Pending    | Pending    |
| Forced TURN behavior                    | Pending    | Pending    |

After the 25-client run, attempt one additional media admission and confirm that it receives the call-capacity error while its drawing session and all existing calls remain active.

## Why

Collaboration sessions currently synchronize drawings and presence but have no live audio or video. Participants need an encrypted conversation alongside the canvas, including sessions with more than ten people and a layout that keeps the current speaker visible.

## What Changes

- Add session-linked WebRTC audio/video with browser permission handling, independent microphone/camera controls, and complete media cleanup on departure.
- Introduce an independently deployable `excalidraw-media-stream-server/` containing a media access API and self-hosted LiveKit SFU/TURN deployment configuration.
- Protect media with browser-to-browser end-to-end encryption in addition to WebRTC transport encryption; keep media keys out of servers.
- Add a responsive right-side vertical participant rail with active-speaker priority, camera-off placeholders, overflow access, and raised-hand indicators.
- Keep Meet-style microphone, camera, and raise/lower-hand controls fixed at the bottom right, with accessible labels and visible states.
- Support more than ten participants through selective media forwarding and adaptive video subscriptions. Use a configurable initial capacity of 25 as a proposed validation baseline, not a claimed unlimited capacity.
- Preserve drawing collaboration when media is unavailable or permissions are denied.

## Capabilities

### New Capabilities

- `session-media`: Session media lifecycle, device permissions, encrypted audio/video, and recovery.
- `media-stream-server`: Separate SFU deployment, room-scoped access, capacity, and operational configuration.
- `participant-media-ui`: Responsive video visibility, stable active-speaker ordering, and meeting controls.

### Modified Capabilities

None. This repository has no existing OpenSpec capability specifications.

## Impact

- Frontend: `excalidraw-app/collab/Collab.tsx`, `Portal.tsx`, app composition/styles, and new media controller/UI modules.
- Existing room server: a narrow integration to attest connected room membership; drawing payload handling remains separate from media routing.
- New service: `excalidraw-media-stream-server/` with its own package, source, tests, Docker deployment, environment example, and README.
- Dependencies/infrastructure: compatible pinned LiveKit client/server SDKs, self-hosted LiveKit, HTTPS/WSS, public ICE connectivity, and TURN credentials.
- Tests: media lifecycle, authorization and room isolation, UI ordering/accessibility, existing collaboration regressions, and multi-browser deployment validation.

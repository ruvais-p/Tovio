## Context

See `proposal.md` for motivation and scope. `Collab.tsx` owns collaboration startup, shutdown, and participant state. `Portal.tsx` sends room-key-encrypted drawing messages through Socket.IO and receives room membership events. `excalidraw-room-server/src/index.ts` is an independent Express/Socket.IO service; it does not currently authenticate user accounts or process media. The room key is carried in the collaboration URL fragment. `packages/excalidraw/data/encryption.ts` provides AES-GCM utilities.

The React app mounts collaboration and an existing right sidebar in `App.tsx`; the video rail must coexist with library/sidebar content and drawing controls. The root Compose file currently launches only the frontend. No media service, media tests, or OpenSpec specifications existed before this change.

## Goals / Non-Goals

**Goals:** Independently deploy media infrastructure; isolate media failures from drawing; minimize video bandwidth according to visible tile size; maintain a stable, accessible speaker-focused rail; validate a deployment with more than ten participants.

**Non-Goals:** Recording, transcription, screen sharing, background effects, moderation roles, account authentication, and full Google Meet feature parity. Match the requested Meet-style interaction patterns without relying on undocumented Google algorithms. No unlimited capacity claim.

## Decisions

### 1. Separate media service using a self-hosted SFU

Create `excalidraw-media-stream-server/` with an independent Node/TypeScript media access API, package/lockfile, tests, Dockerfile, Compose configuration, environment example, and README. Its deployment includes a pinned LiveKit SFU and TURN configuration. This folder is a deployable service bundle: the Node API issues access, while LiveKit performs WebRTC negotiation and packet forwarding.

An SFU avoids each publisher sending a separate video stream to every other participant. Direct peer meshes become expensive beyond small rooms; implementing an SFU from scratch or integrating low-level mediasoup would add substantial negotiation and operational work. LiveKit is the proposed implementation choice, with compatible SDK/server versions pinned and verified during implementation.

```text
Browser ---- encrypted drawing ----> Existing room server
   |                                      |
   +---- membership attestation request --+
   |
   +---- short-lived attestation ----> Media access API
   |                                      |
   +<--- room-scoped media token ----------+
   |
   +---- E2EE WebRTC media ----------> LiveKit SFU / TURN
                                         |
Other browsers <---- E2EE media -----------+
```

### 2. Narrow membership bridge, with explicit trust limits

Add a room-server event that returns a signed, short-lived membership attestation only for the requesting socket's currently joined collaboration room. Derive identity from the server socket, never from a user-supplied participant ID. Include issuer, audience, room, identity, expiry, and unique token ID; use a dedicated signing secret, not the drawing key or LiveKit secret.

The media API exposes `POST /v1/media/token`, accepts that attestation, verifies its signature/scope/expiry, and checks current membership through an authenticated internal room-server endpoint before issuing a short-lived LiveKit token. Prevent attestation replay with a bounded expiry-aware token-ID store. Scope publish/subscribe grants to the attested room and identity, with no administration grants. Rate-limit the endpoint; use an explicit origin allowlist and exclude credentials from logs.

This preserves the existing anonymous invitation model. Current room membership proves a socket joined a room; it does not prove account identity or possession of the fragment key. E2EE keeps media content unavailable to clients without the room-derived media key. Do not describe this bridge as stronger invitation authorization or host admission. Departures trigger an authenticated removal notification to the media API; connection loss uses a short grace period, and reconciliation removes stale media members. A reconnect obtains a new attestation; stale tokens cannot re-admit departed members without a current membership check at the access boundary. Since issued SFU tokens remain bearer credentials until expiry, keep their TTL short and document that replay window.

Alternative: trusting arbitrary room and identity fields at a public token endpoint would allow unrestricted media token minting and is rejected.

### 3. Browser-owned E2EE keys

WebRTC transport encryption alone terminates at an SFU. Enable LiveKit media E2EE before publishing or subscribing, deriving a separate media key in the browser from the existing fragment room key using HKDF with a versioned media-specific context and room ID. Never send the fragment key, derived key, or full invitation URL to either server. Use the SDK's supported key provider and worker; do not implement custom media ciphers.

All participants holding the invitation share room access. Revoking an invitation or rotating keys after removing a participant is outside this existing room model; leaving does not erase knowledge of that invitation. E2EE protects media content, not routing metadata or audio-level metadata used for speaker detection. If the browser cannot support the required encryption, disable media with an actionable explanation and retain drawing. Never silently downgrade to transport-only encryption.

### 4. Session-owned media lifecycle

Add a media controller owned by the app's collaboration lifecycle, separate from drawing synchronization. Model disconnected, requesting-permission, connecting, connected, reconnecting, and failed states. Joining starts a permission-aware camera/mic acquisition flow. Handle audio and video independently so one unavailable device does not block the other. A pending permission prompt must not block canvas initialization. If autoplay is blocked, offer an explicit play-audio action.

On initial entry, request both devices and publish available tracks once permission is granted. Preserve explicit camera/mic choices during reconnect and never re-enable a device automatically after the user turns it off. Camera off stops camera capture; microphone off disables outgoing audio. Explicit session exit, room switch, and unmount stop every local track, detach remote elements, remove listeners, clear timers/key references, and disconnect media. Late asynchronous permission results must be stopped if their session is no longer current. Local preview is muted to avoid echo.

Media failure shows a retry state within the rail and leaves drawing usable. Old sockets and media identities are removed on reconnect, so duplicate tiles cannot accumulate. Disabling media deployment through frontend configuration leaves the current drawing experience functional.

### 5. Responsive vertical rail and stable speaker priority

Measure the actual app content area, including open sidebar width and safe-area insets. Proposed layout defaults: 16:9 tiles, 8px gaps, a desktop rail width clamped between 180px and 280px, and smaller compact tiles on narrow screens. Reserve room for top tools and bottom controls. Compute visible slots from remaining height rather than hard-coded device names. At narrow widths, retain one compact speaker tile and overflow access without blocking the main drawing tools. Position the library/sidebar and rail without overlapping interactive controls.

The dominant remote speaker occupies the first slot; a camera-off speaker receives an avatar tile. Require approximately 800ms of sustained activity before promotion and hold the current top slot for at least 2 seconds to avoid noise-driven churn. Next come recent speakers, other camera-on participants, and remaining participants; use join order/identity as stable tie-breakers. Camera motion does not affect ranking. Display self-preview when space permits and make it accessible through overflow otherwise; local microphone activity does not continually promote self-preview.

Show a `+N more` control for participants outside the visible subset, opening an accessible scrollable list of participant tiles. Overflow does not disconnect participants. Subscribe to video according to actual visibility and rendered dimensions, including visible overflow tiles; keep remote audio subscribed even when its video is hidden. When a hidden speaker is promoted, render a placeholder immediately while their video subscription resumes. Speaker detection must work independently of video subscriptions.

Controls remain anchored at the bottom right: mic, camera, raise/lower hand. Use Meet-style rounded controls, crossed-out device states, selected hand state, tooltips, keyboard focus, and screen-reader labels. Color must not be the only state cue. Publish hand state and initial snapshots via encrypted collaboration messages so late joiners receive it; clear it on departure. Raising a hand adds a badge without displacing the active speaker. Speaker reordering must not move keyboard focus away from a focused control.

### 6. Capacity and validation baseline

Use a configurable room media limit, initially 25 as a planning default. Reaching the limit rejects only media entry with a clear message. Validate at least 12 concurrent real media clients, and run a 25-client load scenario on documented hardware/network settings before claiming the default deployment capacity. Use low-resolution tile subscriptions and an appropriate publisher simulcast configuration; measure CPU, bandwidth, join failures, and audio continuity. Capacity is deployment-dependent.

### Sources

- WebRTC security: https://www.rfc-editor.org/rfc/rfc8827.html
- TURN connectivity: https://webrtc.org/getting-started/turn-server
- LiveKit E2EE: https://docs.livekit.io/transport/encryption/
- LiveKit adaptive subscriptions: https://docs.livekit.io/reference/client-sdk-js/interfaces/RoomOptions.html
- Meet layout behavior: https://support.google.com/meet/answer/10550593?hl=en

## Risks / Trade-offs

- SFU deployment requires public ICE ports, DNS, TLS, and TURN relay bandwidth -> provide explicit deployment configuration and a cross-network relay test.
- E2EE support differs by browser/version -> feature-detect, test the supported browser matrix, and fail closed for media.
- Active-speaker metadata exposes speaking activity to infrastructure -> document this separately from content encryption.
- Anonymous room membership is weaker than authenticated admission -> retain existing invitation semantics, restrict token scope, document bearer-token replay limits, and do not claim host authorization.
- Speaker promotion can interrupt visual tracking -> use hysteresis, stable tie-breakers, and focus-preserving keyed tiles.
- SFU capacity depends on deployment resources -> publish measured limits and configuration, not universal participant guarantees.

## Migration Plan

1. Add and validate the independent media service and membership bridge with media disabled in the frontend.
2. Deploy shared membership credentials, LiveKit API credentials, TLS, and TURN; keep all secrets server-side.
3. Enable the frontend media URL only after room isolation, E2EE, and relay checks pass.
4. Verify 12-client behavior, the configured 25-client baseline, and existing drawing collaboration.
5. Roll back by disabling the frontend media configuration and stopping the media bundle. Retain drawing service operation; no drawing-data migration is required.

## Open Questions

- Production DNS names, TLS termination location, and host resource allocation can be supplied at deployment time through configuration.
- Exact visual spacing and tile clamp values can be refined during responsive verification without changing the vertical rail or ordering contract.

## 1. Separate media deployment

- [x] 1.1 Create `excalidraw-media-stream-server/` with independent TypeScript source, package/lockfile, build/start/test scripts, environment validation, and health/readiness endpoints; verify clean installation, build, and missing-configuration tests.
- [x] 1.2 Pin compatible LiveKit server and SDK versions, and add Dockerfile, self-hosted SFU/TURN Compose configuration, and environment examples; verify Compose configuration and healthy local startup with no committed secrets.
- [x] 1.3 Implement configurable media room capacity with a default of 25 and race-safe admission enforcement; verify concurrent admission at the limit rejects excess clients without evicting current participants.

## 2. Membership and media access

- [x] 2.1 Add signed membership attestations to the existing room server using socket-derived identity and verified joined-room membership; verify forged identities, unrelated rooms, and disconnected sockets cannot obtain valid attestations.
- [x] 2.2 Add an authenticated internal membership-check endpoint and departure notifications, with reconnect grace and stale-member reconciliation; verify unauthorized internal requests fail and departed media identities are removed.
- [x] 2.3 Implement `POST /v1/media/token` with signature/audience/expiry checks, current-membership verification, atomic single-use attestation exchange, and short-lived room-scoped grants; verify tampering, replay, expiry, identity substitution, and cross-room access are rejected.
- [x] 2.4 Add origin restrictions, rate limits, bounded token replay storage, server-only secrets, and credential-redacted logging; verify rejected requests and log output do not expose credentials or encryption keys.

## 3. Browser media lifecycle and encryption

- [x] 3.1 Add the media client controller and deployment configuration, bind it to `Collab.tsx` startup/exit, and exchange membership attestations for media access; verify disabled/unavailable media configuration does not break drawing startup.
- [x] 3.2 Derive a separate room media key using HKDF and initialize the supported E2EE worker/key provider before tracks flow; verify equal-room derivation, room separation, unsupported-browser failure, and no key transmission.
- [x] 3.3 Implement independent camera/microphone permission handling, publication, muted local preview, and blocked-autoplay recovery; verify full permission, partial denial, missing device, pending prompt, and explicit playback cases.
- [x] 3.4 Implement independent device toggles and preserve user choices through reconnect; verify camera-off stops capture, mute stops outgoing audio, and reconnect does not enable disabled devices.
- [x] 3.5 Implement exit, room-switch, unmount, retry, and stale asynchronous result cleanup; verify all tracks/listeners/timers are released and late permission results cannot publish to an old room.

## 4. Participant state and adaptive media

- [x] 4.1 Map media participants to collaboration identities and implement current media indicators plus encrypted raised-hand updates and join snapshots; verify late join, hand lowering, departure cleanup, and duplicate prevention.
- [x] 4.2 Implement dominant-speaker ordering with sustained-activity promotion, minimum hold time, camera-off eligibility, stable tie-breakers, and self-preview handling; verify behavior using a deterministic clock and noise/speaker-change scenarios.
- [x] 4.3 Implement visible-video subscriptions and rendered-size quality adaptation while retaining remote audio and speaker detection; verify hidden participants remain audible and a newly promoted hidden speaker resumes video.

## 5. Responsive meeting interface

- [x] 5.1 Add right-side 16:9 participant tiles and calculate available width/height around existing sidebar, top tools, and bottom controls; verify usable layouts at 360px, 768px, and 1440px widths, short landscape height, and with the library sidebar open.
- [x] 5.2 Add overflow count/list, names, camera-off avatars, microphone/speaking indicators, and raised-hand badges; verify overflow count, current state visibility, and keyboard access with more than ten participants.
- [x] 5.3 Add bottom-right Meet-style mic/camera/hand controls, tooltips, accessible labels, visible focus, and non-color state cues; verify keyboard toggles, focus preservation during speaker changes, and light/dark appearance.
- [x] 5.4 Add media connecting, retry, capacity, permission, unsupported-encryption, and autoplay states; verify each offers the applicable user action while leaving drawing controls usable.

## 6. Integration and deployment validation

- [x] 6.1 Run relevant frontend media tests, existing `excalidraw-app/tests/collab.test.tsx` regressions, TypeScript checks, and applicable lint/build checks for both servers; record commands and results and resolve introduced failures.
- [ ] 6.2 Validate encrypted audio/video with multiple browser clients, wrong-key decryption failure, different-room isolation, permission denial, device toggles, session exit, and reconnect; record tested browser versions and supported E2EE behavior.
- [ ] 6.3 Validate cross-network and forced-TURN media, plus media-service interruption during active drawing; record successful relay use and uninterrupted drawing behavior.
- [ ] 6.4 Run a twelve-client media scenario and the proposed twenty-five-client baseline on documented hardware/network settings; record join success, speaker promotion, overflow behavior, continuous hidden-participant audio, CPU, bandwidth, and any capacity limitations.
- [x] 6.5 Write service and frontend setup instructions covering DNS/TLS, ICE/TURN ports, credentials, membership integration, capacity settings, browser support, invitation/token limitations, and rollback; verify a clean deployment follows the README and disabling media restores drawing-only operation.

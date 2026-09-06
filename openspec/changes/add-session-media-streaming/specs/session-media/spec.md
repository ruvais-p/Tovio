## Purpose

Enable encrypted live audio and video within drawing sessions while preserving collaboration when media is unavailable.

## ADDED Requirements

### Requirement: Permission-aware session entry

The application SHALL start the audio/video join flow when a user enters a collaboration session and SHALL publish available devices only after browser permission is granted. Device permissions SHALL be handled independently without blocking drawing.

#### Scenario: Both devices available

- **WHEN** a participant joins and grants camera and microphone permission
- **THEN** their audio and video become available to media participants in the same room and their local preview is muted

#### Scenario: One device unavailable

- **WHEN** camera permission is denied or no camera exists but microphone access succeeds
- **THEN** the participant can share audio, receives a camera-unavailable state, and can continue drawing

#### Scenario: Permission remains pending

- **WHEN** the browser permission prompt is unanswered
- **THEN** drawing initializes independently and no unapproved device is published

#### Scenario: Playback requires interaction

- **WHEN** the browser blocks remote audio autoplay
- **THEN** the interface provides an explicit action to enable playback

### Requirement: End-to-end encrypted media

Audio and video SHALL use encrypted WebRTC transport and browser-to-browser end-to-end encryption. Media infrastructure SHALL NOT receive media encryption keys or plaintext media content. Unsupported encryption SHALL prevent media publication without preventing drawing.

#### Scenario: Same room key

- **WHEN** two supported clients join with the same invitation key
- **THEN** they can exchange encrypted media without sending that key or its derived media key to servers

#### Scenario: Wrong key

- **WHEN** a client joins the media room without the correct invitation key
- **THEN** it cannot decrypt other participants' media

#### Scenario: Unsupported encryption

- **WHEN** the browser cannot enable required media encryption
- **THEN** media remains disabled with an explanation and no transport-only fallback occurs

### Requirement: Independent device controls

Participants SHALL be able to turn camera and microphone sharing on or off independently. Turning the camera off SHALL stop camera capture; muting SHALL stop outgoing microphone audio.

#### Scenario: Camera disabled

- **WHEN** a participant turns the camera off while sharing audio
- **THEN** camera capture stops, others see a placeholder, and audio continues

#### Scenario: Microphone disabled

- **WHEN** a participant mutes while sharing video
- **THEN** outgoing microphone audio stops, the muted state is visible, and video continues

### Requirement: Session cleanup and recovery

Leaving, switching rooms, or unmounting SHALL stop local capture and release media resources. Reconnection SHALL preserve explicit device choices and avoid duplicate participants. Media failure SHALL leave drawing usable.

#### Scenario: Leave during permission request

- **WHEN** a user leaves before device acquisition resolves
- **THEN** any subsequently acquired tracks are stopped and are never published to the departed room

#### Scenario: Reconnect while muted

- **WHEN** a muted participant reconnects after a network interruption
- **THEN** the microphone remains muted and only one current participant tile represents the connection

#### Scenario: Service unavailable

- **WHEN** the media service fails while drawing collaboration is connected
- **THEN** drawing remains functional and the rail offers a media retry state

#### Scenario: Room switch

- **WHEN** a participant moves to another collaboration room
- **THEN** the previous room receives no further local media and previous room tracks and encryption context are released

## Purpose

Keep participants and current speakers visible beside the canvas through a responsive vertical video rail and accessible meeting controls.

## ADDED Requirements

### Requirement: Responsive participant rail

The application SHALL display rectangular participant tiles vertically at the right side during a media-enabled session. Tile size and visible count SHALL adapt to available width and height without covering essential drawing tools or meeting controls. Hidden participants SHALL remain accessible through an overflow control showing their count.

#### Scenario: Viewport shrinks

- **WHEN** the viewport becomes narrower or shorter
- **THEN** fewer or smaller tiles are displayed, overflow count updates, and drawing and meeting controls remain usable

#### Scenario: Existing sidebar opens

- **WHEN** the user opens the library or another right sidebar
- **THEN** participant and sidebar controls remain independently reachable without overlapping interactive elements

#### Scenario: Overflow is opened

- **WHEN** the participant activates the overflow control
- **THEN** an accessible scrollable participant view exposes the remaining tiles

### Requirement: Stable active-speaker priority

The rail SHALL place the current sustained remote speaker first, followed by recent speakers, remaining camera-on participants, and other participants with stable tie-breaking. Brief noise or camera motion SHALL NOT continually rearrange tiles. Camera-off speakers SHALL remain eligible for the first slot.

#### Scenario: Hidden participant speaks

- **WHEN** a participant outside the visible subset becomes the sustained active speaker
- **THEN** their tile moves to the first slot and displays a placeholder until video is available

#### Scenario: Camera-off speaker

- **WHEN** the sustained active speaker has disabled their camera
- **THEN** their avatar and speaking indicator occupy the first slot

#### Scenario: Brief noise

- **WHEN** another microphone produces activity shorter than the speaker promotion threshold
- **THEN** the current first tile remains stable

### Requirement: Visibility-aware video with continuous audio

The application SHALL adapt received video to rendered tile visibility and size. Hiding a video tile SHALL NOT mute that participant's audio or prevent active-speaker detection.

#### Scenario: Participant becomes hidden

- **WHEN** a resize moves a participant's video outside the visible subset
- **THEN** unnecessary video reception is reduced or paused while their audio and speaking activity remain available

### Requirement: Persistent accessible meeting controls

Microphone, camera, and raise/lower-hand controls SHALL remain at the bottom right with Meet-style rounded presentation, tooltips, visible on/off states, keyboard operation, and accessible labels. State SHALL be conveyed beyond color alone, and speaker reordering SHALL preserve keyboard focus.

#### Scenario: Keyboard toggling

- **WHEN** a keyboard user focuses and activates the microphone control
- **THEN** microphone state toggles, its accessible state updates, and focus remains on the control

#### Scenario: Small viewport

- **WHEN** video tiles overflow on a narrow display
- **THEN** all three controls remain visible and operable without scrolling the participant list

### Requirement: Synchronized participant indicators

Each tile SHALL identify its participant and show microphone, camera-off, speaking, and raised-hand states as applicable. Raising a hand SHALL be a reversible participant state and SHALL NOT displace the active speaker merely because it was raised.

#### Scenario: Hand raised and lowered

- **WHEN** a participant raises or lowers their hand
- **THEN** other participants see the corresponding badge update and the local control reflects the new state

#### Scenario: Late joiner

- **WHEN** a participant joins after another participant has raised their hand
- **THEN** the newcomer receives the current raised-hand state

#### Scenario: Departure

- **WHEN** a participant leaves the session
- **THEN** their tile and raised-hand state are removed

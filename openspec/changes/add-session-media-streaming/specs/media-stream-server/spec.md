## Purpose

Provide independently deployable media infrastructure with scoped room access and support for sessions exceeding ten participants.

## ADDED Requirements

### Requirement: Independent media deployment

The media service SHALL be delivered under `excalidraw-media-stream-server/` with independent startup, build, health checks, environment documentation, and deployment configuration. Media outages SHALL NOT stop the drawing room service.

#### Scenario: Separate deployment

- **WHEN** an operator starts the documented media deployment with valid configuration
- **THEN** media access and forwarding become healthy without starting a second drawing room service

#### Scenario: Missing configuration

- **WHEN** required signing credentials or media service configuration are absent
- **THEN** the affected service reports an actionable startup/readiness failure without printing secrets

### Requirement: Verified room-scoped media access

The media access API SHALL issue short-lived publish/subscribe credentials only after verifying an unexpired membership attestation and current collaboration membership. The room and participant identity SHALL originate from trusted membership information. Client access SHALL NOT include administrative privileges.

#### Scenario: Valid access

- **WHEN** a currently connected participant exchanges a valid unused membership attestation
- **THEN** credentials authorize only that participant identity and collaboration room

#### Scenario: Invalid or reused attestation

- **WHEN** an attestation is tampered with, expired, already exchanged, or belongs to a departed connection
- **THEN** credential issuance is rejected

#### Scenario: Room substitution

- **WHEN** a caller attempts to request a different room or participant identity
- **THEN** the service rejects the mismatch rather than granting the requested scope

#### Scenario: Participant leaves

- **WHEN** the room service reports a participant's explicit departure
- **THEN** the media service disconnects that media identity and refuses new credentials based on the departed membership

### Requirement: Confidential credentials and invitation keys

The service SHALL keep infrastructure secrets server-side and SHALL NOT accept, require, or log invitation encryption keys, derived media keys, or full invitation URLs. Access logs SHALL exclude bearer credentials.

#### Scenario: Token exchange

- **WHEN** a participant obtains media credentials
- **THEN** the request contains membership authorization without the drawing invitation key and logs omit credentials

### Requirement: Capacity above ten participants

The deployment SHALL support configurable room media capacity greater than ten, with an initial proposed default of 25. It SHALL reject excess media admission clearly while preserving drawing access and existing calls.

#### Scenario: Twelve participants

- **WHEN** twelve supported clients join on the documented validation deployment
- **THEN** all twelve can publish and receive media with responsive tile subscriptions

#### Scenario: Capacity reached

- **WHEN** another participant requests media access at the configured limit
- **THEN** media entry is rejected with a capacity explanation, existing media continues, and the participant retains drawing access

### Requirement: Cross-network media connectivity

The deployment SHALL document secure public signaling and relay configuration and SHALL support media when a direct client media path is unavailable.

#### Scenario: Relay required

- **WHEN** clients on separate networks cannot establish a direct media path and configured relay connectivity is available
- **THEN** encrypted media connects through the relay

import {
  Room,
  RoomEvent,
  Track,
  ExternalE2EEKeyProvider,
  isE2EESupported,
  createLocalAudioTrack,
  createLocalVideoTrack,
} from "livekit-client";
import LiveKitWorker from "livekit-client/e2ee-worker?worker";
import {
  encryptData,
  decryptData,
} from "@excalidraw/excalidraw/data/encryption";

import { deriveMediaKey } from "./crypto";
import { SpeakerOrder } from "./layout";

import type {
  LocalAudioTrack,
  LocalVideoTrack,
  Participant,
  RemoteTrackPublication,
} from "livekit-client";
import type { Socket } from "socket.io-client";

export interface MediaPerson {
  identity: string;
  name: string;
  local: boolean;
  camera: boolean;
  microphone: boolean;
  hand: boolean;
  speaking: boolean;
  participant?: Participant;
}
export interface MediaSnapshot {
  status:
    | "connecting"
    | "connected"
    | "reconnecting"
    | "failed"
    | "unsupported";
  error: string;
  cameraError: string;
  microphoneError: string;
  camera: boolean;
  microphone: boolean;
  cameraPending: boolean;
  microphonePending: boolean;
  hand: boolean;
  audioBlocked: boolean;
  people: MediaPerson[];
}
export interface MediaSessionOptions {
  socket: Socket;
  roomId: string;
  roomKey: string;
  identity: string;
  name: string;
  apiUrl: string;
}

export class MediaSession {
  room: Room | null = null;
  private options: MediaSessionOptions;
  private listeners = new Set<() => void>();
  private snapshot: MediaSnapshot = {
    status: "connecting",
    error: "",
    cameraError: "",
    microphoneError: "",
    camera: false,
    microphone: false,
    cameraPending: false,
    microphonePending: false,
    hand: false,
    audioBlocked: false,
    people: [],
  };
  private worker?: Worker;
  private generation = 0;
  private disposed = false;
  private abort?: AbortController;
  private order = new SpeakerOrder();
  private active: string[] = [];
  private known = new Set<string>();
  private state = new Map<
    string,
    { name: string; hand: boolean; seq: number }
  >();
  private sequence = 0;
  private tracks = new Set<LocalAudioTrack | LocalVideoTrack>();
  private desired = { camera: true, microphone: true };
  private timer: ReturnType<typeof setInterval>;

  constructor(options: MediaSessionOptions) {
    this.options = options;
    this.known.add(options.identity);
    options.socket.on("media-state", this.receiveState);
    options.socket.on("room-user-change", this.membersChanged);
    options.socket.on("new-user", this.newUser);
    this.timer = setInterval(() => {
      this.order.update(this.active, Date.now());
      this.refresh();
    }, 250);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private update(patch: Partial<MediaSnapshot>) {
    if (this.disposed) {
      return;
    }
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  setName(name: string) {
    this.options.name = name;
    void this.broadcastState();
    this.refresh();
  }
  setMembers = (members: string[]) => this.membersChanged(members);
  private membersChanged = (members: string[]) => {
    this.known = new Set(members);
    for (const id of this.state.keys()) {
      if (!this.known.has(id)) {
        this.state.delete(id);
      }
    }
    this.refresh();
  };
  private newUser = () => {
    void this.broadcastState();
  };

  private broadcastState = async (request = false) => {
    const { socket, roomId, roomKey, name } = this.options;
    const generation = this.generation;
    try {
      const { encryptedBuffer, iv } = await encryptData(
        roomKey,
        JSON.stringify({
          name: name.slice(0, 80),
          hand: this.snapshot.hand,
          seq: ++this.sequence,
          request,
        }),
      );
      if (
        !this.disposed &&
        generation === this.generation &&
        socket.connected
      ) {
        socket.emit("media-state", roomId, encryptedBuffer, iv);
      }
    } catch {
      /* Drawing is independent of optional media indicators. */
    }
  };
  private receiveState = async (
    identity: string,
    data: ArrayBuffer,
    iv: Uint8Array<ArrayBuffer>,
  ) => {
    const generation = this.generation;
    if (
      !this.known.has(identity) ||
      data.byteLength > 4096 ||
      iv.byteLength !== 12
    ) {
      return;
    }
    try {
      const plain = await decryptData(
        new Uint8Array(iv),
        data,
        this.options.roomKey,
      );
      const value = JSON.parse(new TextDecoder().decode(plain));
      if (
        this.disposed ||
        generation !== this.generation ||
        !this.known.has(identity) ||
        typeof value.name !== "string" ||
        value.name.length > 80 ||
        typeof value.hand !== "boolean" ||
        !Number.isSafeInteger(value.seq) ||
        value.seq <= (this.state.get(identity)?.seq ?? -1)
      ) {
        return;
      }
      this.state.set(identity, value);
      if (value.request === true) {
        void this.broadcastState();
      }
      this.refresh();
    } catch {
      /* Ignore malformed or unauthenticated room data. */
    }
  };

  private refresh = () => {
    const room = this.room;
    const participants = new Map<string, Participant>();
    if (room) {
      room.remoteParticipants.forEach((p, id) => participants.set(id, p));
      participants.set(this.options.identity, room.localParticipant);
    }
    const people: MediaPerson[] = [...this.known].map((identity) => {
      const local = identity === this.options.identity;
      const participant = participants.get(identity);
      return {
        identity,
        local,
        participant,
        name: local
          ? this.options.name || "You"
          : this.state.get(identity)?.name || "Participant",
        camera: local
          ? this.snapshot.camera
          : participant?.isCameraEnabled ?? false,
        microphone: local
          ? this.snapshot.microphone
          : participant?.isMicrophoneEnabled ?? false,
        hand: local
          ? this.snapshot.hand
          : this.state.get(identity)?.hand ?? false,
        speaking: this.active.includes(identity),
      };
    });
    this.update({
      people: this.order.sort(people),
      audioBlocked: !!room && !room.canPlaybackAudio,
    });
  };

  start = async () => {
    await this.stopConnection();
    if (this.disposed) {
      return;
    }
    const generation = this.generation;
    this.update({
      status: "connecting",
      error: "",
      cameraError: "",
      microphoneError: "",
    });
    if (!isE2EESupported() || !crypto.subtle || !navigator.mediaDevices) {
      this.update({
        status: "unsupported",
        error:
          "Encrypted calls aren’t supported in this browser. Use a current browser over HTTPS. You can still draw.",
      });
      return;
    }
    const abort = new AbortController();
    this.abort = abort;
    try {
      const attestation = await new Promise<string>((resolve, reject) => {
        this.options.socket
          .timeout(5000)
          .emit(
            "media-attestation",
            this.options.roomId,
            (
              error: Error | null,
              response: { attestation?: string; error?: string },
            ) => {
              if (error || !response?.attestation) {
                reject(
                  new Error(
                    response?.error ||
                      "Call server is unavailable. You can still draw.",
                  ),
                );
              } else {
                resolve(response.attestation);
              }
            },
          );
      });
      if (generation !== this.generation || this.disposed) {
        return;
      }
      const response = await fetch(
        `${this.options.apiUrl.replace(/\/$/, "")}/v1/media/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attestation }),
          signal: abort.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        },
      );
      const access = await response.json();
      if (!response.ok) {
        throw new Error(access.error || "Unable to join this call.");
      }
      if (generation !== this.generation || this.disposed) {
        return;
      }
      if (access.identity !== this.options.identity) {
        throw new Error("Session changed. Rejoin the call.");
      }
      const key = await deriveMediaKey(
        this.options.roomId,
        this.options.roomKey,
      );
      if (generation !== this.generation || this.disposed) {
        return;
      }
      const keyProvider = new ExternalE2EEKeyProvider();
      await keyProvider.setKey(key);
      new Uint8Array(key).fill(0);
      if (generation !== this.generation || this.disposed) {
        return;
      }
      this.worker = new LiveKitWorker();
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        encryption: { keyProvider, worker: this.worker },
        publishDefaults: {
          simulcast: true,
          videoCodec: "vp8",
          stopMicTrackOnMute: true,
        },
      });
      this.room = room;
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.active = speakers.filter((p) => !p.isLocal).map((p) => p.identity);
        this.order.update(this.active, Date.now());
        this.refresh();
      });
      room.on(RoomEvent.Reconnecting, () =>
        this.update({ status: "reconnecting" }),
      );
      room.on(RoomEvent.Reconnected, () => {
        this.update({ status: "connected" });
        void this.broadcastState(true);
      });
      room.on(RoomEvent.Disconnected, () => {
        if (generation === this.generation && !this.disposed) {
          void this.stopConnection();
          this.update({
            status: "failed",
            error: "Call disconnected. Rejoin when you’re ready.",
          });
        }
      });
      room.on(RoomEvent.EncryptionError, () => {
        void this.stopConnection();
        this.update({
          status: "failed",
          error:
            "Unable to decrypt this call. Check that you used the correct invitation.",
        });
      });
      for (const event of [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackPublished,
        RoomEvent.TrackUnpublished,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.AudioPlaybackStatusChanged,
      ]) {
        room.on(event, this.refresh);
      }
      await room.setE2EEEnabled(true);
      if (generation !== this.generation || this.disposed) {
        await room.disconnect();
        return;
      }
      await room.connect(access.url, access.token, { autoSubscribe: true });
      if (generation !== this.generation || this.disposed) {
        await room.disconnect();
        return;
      }
      this.update({ status: "connected" });
      this.refresh();
      void this.broadcastState(true);
      // Each permission request resolves independently; neither blocks the canvas or the other track.
      void this.setDevice("camera", this.desired.camera);
      void this.setDevice("microphone", this.desired.microphone);
    } catch (error) {
      if (generation !== this.generation || this.disposed) {
        return;
      }
      await this.stopConnection();
      this.update({
        status: "failed",
        error:
          error instanceof Error ? error.message : "Unable to join this call.",
      });
    }
  };

  setDevice = async (device: "camera" | "microphone", enabled: boolean) => {
    this.desired[device] = enabled;
    const room = this.room;
    if (!room || this.snapshot[`${device}Pending`]) {
      return;
    }
    const generation = this.generation;
    this.update({ [`${device}Pending`]: true, [`${device}Error`]: "" });
    try {
      const source =
        device === "camera" ? Track.Source.Camera : Track.Source.Microphone;
      const existing = room.localParticipant.getTrackPublication(source)?.track;
      if (!enabled) {
        if (existing) {
          existing.stop();
          await room.localParticipant.unpublishTrack(existing);
          this.tracks.delete(existing as LocalAudioTrack | LocalVideoTrack);
        }
      } else if (!existing) {
        const track =
          device === "camera"
            ? await createLocalVideoTrack({
                resolution: { width: 640, height: 360, frameRate: 24 },
              })
            : await createLocalAudioTrack({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              });
        if (
          this.disposed ||
          generation !== this.generation ||
          !this.desired[device]
        ) {
          track.stop();
          return;
        }
        this.tracks.add(track);
        try {
          await room.localParticipant.publishTrack(track, { source });
        } catch (error) {
          track.stop();
          this.tracks.delete(track);
          throw error;
        }
        if (this.disposed || generation !== this.generation) {
          track.stop();
          return;
        }
      }
      if (generation === this.generation) {
        this.update({ [device]: enabled });
      }
    } catch {
      if (generation === this.generation) {
        this.update({
          [device]: false,
          [`${device}Error`]: `${
            device === "camera" ? "Camera" : "Microphone"
          } unavailable. Check browser permissions and try again.`,
        });
      }
    } finally {
      if (generation === this.generation) {
        this.update({ [`${device}Pending`]: false });
        this.refresh();
      }
    }
  };

  toggleHand = () => {
    this.update({ hand: !this.snapshot.hand });
    void this.broadcastState();
    this.refresh();
  };
  startAudio = async () => {
    try {
      await this.room?.startAudio();
    } catch {
      this.update({ audioBlocked: true });
    }
    this.refresh();
  };
  setVideoVisible = (publication: RemoteTrackPublication, visible: boolean) => {
    if (publication.kind === Track.Kind.Video) {
      publication.setSubscribed(visible);
    }
  };

  private async stopConnection() {
    ++this.generation;
    this.abort?.abort();
    this.tracks.forEach((track) => track.stop());
    this.tracks.clear();
    const room = this.room;
    this.room = null;
    room?.removeAllListeners();
    this.worker?.terminate();
    this.worker = undefined;
    this.active = [];
    this.update({
      camera: false,
      microphone: false,
      cameraPending: false,
      microphonePending: false,
    });
    await room?.disconnect();
  }

  dispose = () => {
    this.disposed = true;
    this.options.socket.off("media-state", this.receiveState);
    this.options.socket.off("room-user-change", this.membersChanged);
    this.options.socket.off("new-user", this.newUser);
    clearInterval(this.timer);
    this.listeners.clear();
    this.state.clear();
    this.known.clear();
    void this.stopConnection();
    this.options.roomKey = "";
  };
}

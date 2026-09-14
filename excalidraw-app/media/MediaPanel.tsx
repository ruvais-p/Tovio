import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Track } from "livekit-client";

import { MediaSession } from "./MediaSession";
import { railLayout } from "./layout";

import "./MediaPanel.scss";

import type { MediaPerson, MediaSessionOptions } from "./MediaSession";
import type { RemoteTrackPublication } from "livekit-client";

function Icon({
  kind,
  off = false,
}: {
  kind: "camera" | "microphone" | "hand" | "people" | "close" | "lock";
  off?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "camera" && (
        <>
          <rect x="3" y="6" width="12" height="12" rx="3" />
          <path d="m15 10 6-3v10l-6-3" />
        </>
      )}
      {kind === "microphone" && (
        <>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
        </>
      )}
      {kind === "hand" && (
        <path d="M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-7a2 2 0 0 1 4 0v10a7 7 0 0 1-12 5l-5-6a2 2 0 0 1 3-3l2 2" />
      )}
      {kind === "people" && (
        <>
          <circle cx="9" cy="7" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" />
        </>
      )}
      {kind === "close" && <path d="m6 6 12 12M6 18 18 6" />}
      {kind === "lock" && (
        <>
          <rect x="5" y="10" width="14" height="11" rx="3" />
          <path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2" />
        </>
      )}
      {off && <path d="m3 3 18 18" strokeWidth="2.5" />}
    </svg>
  );
}

function ParticipantVideo({
  person,
  session,
}: {
  person: MediaPerson;
  session: MediaSession;
}) {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const publication = person.participant?.getTrackPublication(
    Track.Source.Camera,
  );
  const track = publication?.videoTrack;
  useEffect(() => {
    const element = video.current;
    if (!element || !track) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  useEffect(() => {
    if (person.local || !publication || !container.current) {
      return;
    }
    const remote = publication as RemoteTrackPublication;
    const observer = new IntersectionObserver(
      ([entry]) => {
        session.setVideoVisible(remote, entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      session.setVideoVisible(remote, false);
    };
  }, [publication, person.local, session]);
  return (
    <div
      ref={container}
      className={`media-tile${person.speaking ? " media-tile--speaking" : ""}`}
      aria-label={`${person.name}${person.local ? ", you" : ""}${
        person.speaking ? ", speaking" : ""
      }`}
    >
      <div className="media-tile__avatar" aria-hidden="true">
        <span>{person.name.trim().slice(0, 1).toUpperCase() || "?"}</span>
      </div>
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        className={`${person.local ? "media-tile__self " : ""}${
          person.camera && track ? "" : "media-tile__hidden"
        }`}
      />
      <div className="media-tile__badges">
        {person.hand && (
          <span className="media-tile__hand" title="Hand raised">
            <Icon kind="hand" />
            <span className="media-sr-only">Hand raised</span>
          </span>
        )}
        {!person.microphone && (
          <span title="Microphone off">
            <Icon kind="microphone" off />
            <span className="media-sr-only">Microphone off</span>
          </span>
        )}
      </div>
      <div className="media-tile__name">
        <span>
          {person.name}
          {person.local && person.name !== "You" ? " (You)" : ""}
        </span>
        {person.speaking && (
          <span className="media-speaking" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
    </div>
  );
}

function ParticipantAudio({ person }: { person: MediaPerson }) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = person.participant?.getTrackPublication(
    Track.Source.Microphone,
  )?.audioTrack;
  useEffect(() => {
    const element = audio.current;
    if (!track || !element || person.local) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track, person.local]);
  return person.local ? null : <audio ref={audio} autoPlay />;
}

function MediaControls({ session }: { session: MediaSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return (
    <div className="media-controls" role="group" aria-label="Call controls">
      {(["microphone", "camera"] as const).map((device) => {
        const label = `${state[device] ? "Turn off" : "Turn on"} ${device}`;
        return (
          <button
            key={device}
            type="button"
            className={`media-control${
              !state[device] ? " media-control--off" : ""
            }`}
            aria-label={label}
            title={label}
            aria-pressed={state[device]}
            disabled={state.status !== "connected" || state[`${device}Pending`]}
            onClick={() => void session.setDevice(device, !state[device])}
          >
            <Icon kind={device} off={!state[device]} />
          </button>
        );
      })}
      <button
        type="button"
        className={`media-control${state.hand ? " media-control--raised" : ""}`}
        aria-label={state.hand ? "Lower hand" : "Raise hand"}
        title={state.hand ? "Lower hand" : "Raise hand"}
        aria-pressed={state.hand}
        onClick={session.toggleHand}
      >
        <Icon kind="hand" />
      </button>
    </div>
  );
}

function CallRail({
  session,
  host,
}: {
  session: MediaSession;
  host: HTMLElement;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [layout, setLayout] = useState(() =>
    railLayout(host.clientWidth, host.clientHeight),
  );
  const [overflow, setOverflow] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const resize = () =>
      setLayout(railLayout(host.clientWidth, host.clientHeight));
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => observer.disconnect();
  }, [host]);
  useLayoutEffect(() => {
    const old = host.style.getPropertyValue("--session-media-width");
    host.style.setProperty(
      "--session-media-width",
      `${layout.tileWidth + 24}px`,
    );
    host.classList.add("has-session-media");
    return () => {
      host.classList.remove("has-session-media");
      if (old) {
        host.style.setProperty("--session-media-width", old);
      } else {
        host.style.removeProperty("--session-media-width");
      }
    };
  }, [host, layout.tileWidth]);
  useEffect(() => {
    if (overflow) {
      closeButton.current?.focus();
    }
  }, [overflow]);
  const closeOverflow = () => {
    setOverflow(false);
    moreButton.current?.focus();
  };
  const visible = state.people.slice(0, layout.slots);
  const hidden = state.people.slice(layout.slots);
  useEffect(() => {
    if (!session.room) {
      return;
    }
    const ids = new Set(
      (overflow ? state.people : visible).map((p) => p.identity),
    );
    session.room.remoteParticipants.forEach((p) => {
      p.videoTrackPublications.forEach((publication) => {
        if (!ids.has(p.identity)) {
          session.setVideoVisible(publication, false);
        }
      });
    });
  }, [session, state.people, visible, overflow]);
  const status =
    state.status === "connecting"
      ? "Joining call…"
      : state.status === "reconnecting"
      ? "Reconnecting…"
      : "In this call";
  return (
    <aside
      className={`session-media${
        layout.compact ? " session-media--compact" : ""
      }`}
      style={{ width: layout.tileWidth }}
      aria-label="Session call"
    >
      <div className="session-media__header">
        <span>{status}</span>
        <span title="End-to-end encrypted media">
          <Icon kind="lock" />
        </span>
      </div>
      {hidden.length > 0 && (
        <button
          ref={moreButton}
          type="button"
          className="media-more"
          aria-expanded={overflow}
          onClick={() => setOverflow(!overflow)}
        >
          <Icon kind="people" /> +{hidden.length} more
        </button>
      )}
      <div className="session-media__tiles">
        {visible.map((person) => (
          <ParticipantVideo
            key={person.identity}
            person={person}
            session={session}
          />
        ))}
      </div>
      {overflow && (
        <section
          className="media-overflow"
          aria-label="More participants"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeOverflow();
              event.stopPropagation();
            }
          }}
        >
          <div className="media-overflow__header">
            <span>Participants · {state.people.length}</span>
            <button
              ref={closeButton}
              type="button"
              aria-label="Close participants"
              onClick={closeOverflow}
            >
              <Icon kind="close" />
            </button>
          </div>
          <div className="media-overflow__tiles">
            {hidden.map((person) => (
              <ParticipantVideo
                key={person.identity}
                person={person}
                session={session}
              />
            ))}
          </div>
        </section>
      )}
      <div className="session-media__messages" role="status">
        {state.error && <p>{state.error}</p>}
        {state.status === "failed" && (
          <button type="button" onClick={() => void session.start()}>
            Rejoin call
          </button>
        )}
        {state.cameraPending && <p>Waiting for camera permission…</p>}
        {state.microphonePending && <p>Waiting for microphone permission…</p>}
        {state.cameraError && <p>{state.cameraError}</p>}
        {state.microphoneError && <p>{state.microphoneError}</p>}
        {state.audioBlocked && state.status === "connected" && (
          <button type="button" onClick={() => void session.startAudio()}>
            Play call audio
          </button>
        )}
      </div>
      {state.people.map((person) => (
        <ParticipantAudio key={person.identity} person={person} />
      ))}
      <MediaControls session={session} />
    </aside>
  );
}

export default function MediaPanel({
  options,
  members,
}: {
  options: MediaSessionOptions;
  members: string[];
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [session, setSession] = useState<MediaSession | null>(null);
  useLayoutEffect(() => {
    setHost(marker.current?.closest<HTMLElement>(".excalidraw-app") ?? null);
  }, []);
  useEffect(() => {
    const current = new MediaSession(options);
    setSession(current);
    void current.start();
    return () => current.dispose();
    // Identity/room changes remount this component via its parent key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.socket, options.identity, options.roomId]);
  useEffect(() => {
    session?.setMembers(members);
  }, [session, members]);
  useEffect(() => {
    session?.setName(options.name);
  }, [session, options.name]);
  return (
    <>
      <span ref={marker} hidden />
      {host &&
        session &&
        createPortal(<CallRail session={session} host={host} />, host)}
    </>
  );
}

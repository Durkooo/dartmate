import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  VideoPresets,
  ConnectionQuality,
  type Participant,
} from 'livekit-client';
import { trackOptions, singleShotFocus } from '@/lib/video';
import { Txt } from '@/components/DartsUI';
import { VideoControls, VideoNotice } from '@/components/VideoUI';
import { feedback, palette } from '@/lib/darts';
import { getVideoCredentials } from '@/lib/video';
import type { VideoCallProps } from '@/components/VideoCall';

type MediaTrack = { track: Track | undefined; local: boolean };
/** Stav súperovho obrazu pre diagnostiku (null = video svieti, netreba nič). */
function peerStatus(room: Room, tracks: MediaTrack[]): string | null {
  if (tracks.some((t) => !t.local && t.track && !t.track.isMuted)) return null;
  const peer = [...room.remoteParticipants.values()][0];
  if (!peer) return 'Súper sa ešte nepripojil';
  const pub = peer.getTrackPublication(Track.Source.Camera);
  if (!pub) return 'Súper je pripojený, kameru nevysiela';
  if (pub.isMuted) return 'Súper má vypnutú kameru';
  const subscribed = (pub as unknown as { isSubscribed?: boolean }).isSubscribed;
  return subscribed === false ? 'Čakám na súperov obraz…' : 'Súperov obraz sa načítava…';
}
function snapshotTracks(room: Room): MediaTrack[] {
  const tracks: MediaTrack[] = [
    { track: room.localParticipant.getTrackPublication(Track.Source.Camera)?.track, local: true },
  ];
  for (const participant of room.remoteParticipants.values()) {
    tracks.push(
      { track: participant.getTrackPublication(Track.Source.Camera)?.track, local: false },
      { track: participant.getTrackPublication(Track.Source.Microphone)?.track, local: false },
    );
  }
  return tracks;
}

export default function VideoCall({
  matchId,
  onLeave,
  large,
  micWanted = true,
  onMicChange,
  getCredentials,
  peerName,
  initialFacing,
  initialDeviceId,
}: VideoCallProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState('');
  const [request, setRequest] = useState({ matchId });
  const [tracks, setTracks] = useState<MediaTrack[]>([]);
  const [pending, setPending] = useState(false);
  const micRef = useRef(micWanted);
  useEffect(() => {
    micRef.current = micWanted;
  }, [micWanted]);
  // Automatická kvalita videa podľa internetu: 480p ↔ 720p ↔ 1080p (max raz za 8 s).
  const videoTier = useRef(1);
  const videoPresets = [VideoPresets.h480, VideoPresets.h720, VideoPresets.h1080];
  const [deviceId, setDeviceId] = useState<string | undefined>(initialDeviceId);
  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(micWanted);
  const [facing, setFacing] = useState<'user' | 'environment'>(initialFacing ?? 'user');
  const currentRoom = useRef<Room | null>(null);
  const localHost = useRef<HTMLDivElement>(null);
  const remoteHost = useRef<HTMLDivElement>(null);
  const [previousSession, setPreviousSession] = useState(request);
  // Vlastné credentials (chat) cez refku, aby sa efekt nespúšťal dookola.
  const credsRef = useRef(getCredentials);
  useEffect(() => {
    credsRef.current = getCredentials;
  }, [getCredentials]);
  if (request.matchId !== matchId) setRequest({ matchId });
  if (previousSession !== request) {
    setPreviousSession(request);
    setError('');
    setRoom(null);
  }
  useEffect(() => {
    let active = true;
    const session = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: VideoPresets.h720 },
    });
    const fail = (e: unknown) => {
      if (active) {
        setError(e instanceof Error ? e.message : 'Video sa nepodarilo pripojiť.');
        feedback.error();
      }
    };
    const update = () => {
      if (active) {
        setTracks(snapshotTracks(session));
        setCamera(session.localParticipant.isCameraEnabled);
        setMicrophone(session.localParticipant.isMicrophoneEnabled);
      }
    };
    session
      .on(RoomEvent.TrackSubscribed, update)
      .on(RoomEvent.TrackUnsubscribed, update)
      .on(RoomEvent.LocalTrackPublished, update)
      .on(RoomEvent.LocalTrackUnpublished, update)
      .on(RoomEvent.TrackMuted, update)
      .on(RoomEvent.TrackUnmuted, update)
      .on(RoomEvent.ParticipantConnected, update)
      .on(RoomEvent.ParticipantDisconnected, update);
    void (async () => {
      try {
        const credentials = await (credsRef.current
          ? credsRef.current()
          : getVideoCredentials(request.matchId));
        if (!active) return;
        await session.connect(credentials.url, credentials.token);
        if (!active) {
          await session.disconnect();
          return;
        }
        currentRoom.current = session;
        setRoom(session);
        update();
        await session.startAudio();
        if (!active) {
          await session.disconnect();
          return;
        }
        const facingMode = initialFacing ?? 'user';
        const enableCam = (deviceId?: string) =>
          session.localParticipant.setCameraEnabled(true, {
            resolution: VideoPresets.h720,
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode }),
          });
        try {
          await enableCam(initialDeviceId);
        } catch {
          // Konkrétne zariadenie nemusí existovať — skús stranu.
          try {
            if (initialDeviceId) await enableCam(undefined);
            else throw new Error('blocked');
          } catch (e) {
            if (active) {
              const msg = e instanceof Error ? `${e.message} ${e.name}` : '';
              const blocked = /notallowed|denied|permission/i.test(msg);
              setError(
                blocked
                  ? 'Kamera je zablokovaná — povoľ ju v prehliadači a zapni ju tlačidlom nižšie.'
                  : 'Kameru sa nepodarilo zapnúť. Skús ju zapnúť tlačidlom nižšie.',
              );
            }
          }
        }
        try {
          if (!active) {
            await session.disconnect();
            return;
          }
          // Mikrofón si pamätáme po celý zápas: raz vypnutý = vypnutý,
          // kým ho hráč v tomto zápase znova nezapne. Čítame z refky,
          // nie zo stavu (ten sa počas pripájania mohol zmeniť).
          await session.localParticipant.setMicrophoneEnabled(micRef.current);
          if (!active) {
            await session.disconnect();
            return;
          }
          setMicrophone(micRef.current);
          update();
        } catch (e) {
          fail(e);
        }
      } catch (e) {
        fail(e);
      }
    })();
    return () => {
      active = false;
      currentRoom.current = null;
      session.removeAllListeners();
      void session.disconnect();
    };
  }, [request]);
  // Auto-kvalita podľa internetu (vlastný efekt — vidí aktuálnu kameru).
  useEffect(() => {
    if (!room) return undefined;
    let cooling = false;
    const applyQuality = (quality: ConnectionQuality) => {
      const tier =
        quality === ConnectionQuality.Excellent ? 2 : quality === ConnectionQuality.Good ? 1 : 0;
      if (tier === videoTier.current || cooling) return;
      videoTier.current = tier;
      cooling = true;
      setTimeout(() => {
        cooling = false;
      }, 8000);
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const track = pub?.track;
      if (track instanceof LocalVideoTrack && room.localParticipant.isCameraEnabled) {
        const res = videoPresets[tier].resolution;
        // restartTrack bez zdroja by prepol na prednú kameru — držíme stranu aj zariadenie.
        void track
          .restartTrack({
            resolution: { width: res.width, height: res.height, frameRate: 30 },
            ...trackOptions(facing, deviceId),
          })
          .catch(() => undefined);
      }
    };
    const qualityHandler = (quality: ConnectionQuality, participant: Participant) => {
      if (participant.isLocal) applyQuality(quality);
    };
    room.on(RoomEvent.ConnectionQualityChanged, qualityHandler);
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, qualityHandler);
    };
  }, [room, facing, deviceId]);
  const [rxSize, setRxSize] = useState('');
  useEffect(() => {
    if (!room) return undefined;
    const id = setInterval(() => {
      try {
        const pub = [...room.remoteParticipants.values()]
          .map((p) => p.getTrackPublication(Track.Source.Camera))
          .find((p) => p && !p.isMuted && p.track);
        const t = (pub?.track ?? null) as unknown as {
          mediaStreamTrack?: unknown;
        } | null;
        const ms = (t?.mediaStreamTrack ?? null) as unknown as {
          getSettings?: () => unknown;
        } | null;
        const s = (typeof ms?.getSettings === 'function' ? ms.getSettings() : {}) as {
          width?: unknown;
          height?: unknown;
        };
        const label =
          typeof s.width === 'number' && typeof s.height === 'number'
            ? `${s.width}×${s.height}`
            : '';
        setRxSize((prev) => (prev === label ? prev : label));
      } catch {
        // Ignoruj — údaj sa len neobnoví.
      }
    }, 3000);
    return () => clearInterval(id);
  }, [room]);
  useEffect(() => {
    if (!room) return;
    if (room.localParticipant.isMicrophoneEnabled === microphone) return;
    // Priama synchronizácia (bez control): beží na pozadí pri zmene voľby.
    void room.localParticipant.setMicrophoneEnabled(microphone).catch(() => {
      feedback.error();
    });
  }, [microphone, room]);
  const remoteHeight = large ? 440 : 160; // veľké okno súpera, keď čakám
  useEffect(() => {
    if (!room) return undefined;
    const elements: { track: Track; element: HTMLMediaElement }[] = [];
    const attach = (track: Track | undefined, host: HTMLDivElement | null, local: boolean) => {
      if (!track || !host || track.isMuted) return;
      const element = track.attach();
      element.autoplay = true;
      if (element instanceof HTMLVideoElement) {
        element.playsInline = true;
        element.style.width = '100%';
        element.style.height = local ? '150px' : `${remoteHeight}px`;
        element.style.objectFit = 'contain';
      }
      if (local) element.muted = true;
      host.appendChild(element);
      elements.push({ track, element });
    };
    for (const { track, local } of tracks) {
      // Hádžem: zobrazíme len SÚPEROVU kameru – moju lokálnu skryjeme.
      if (!large && local) continue;
      attach(track, local ? localHost.current : remoteHost.current, local);
    }
    return () => {
      for (const { track, element } of elements) {
        track.detach(element);
        element.pause();
        element.srcObject = null;
        element.remove();
      }
    };
  }, [room, tracks, large, remoteHeight]);
  const control = async (action: () => Promise<unknown>) => {
    if (!room || pending) return;
    setPending(true);
    setError('');
    try {
      await action();
      if (currentRoom.current !== room) {
        await room.disconnect();
        return;
      }
      setCamera(room.localParticipant.isCameraEnabled);
      setMicrophone(room.localParticipant.isMicrophoneEnabled);
      setTracks(snapshotTracks(room));
      feedback.selection();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kamera alebo mikrofón nie sú dostupné.');
      feedback.error();
    } finally {
      setPending(false);
    }
  };
  if (!room)
    return (
      <VideoNotice
        error={error}
        pending={!error}
        retry={() => setRequest({ matchId })}
        leave={onLeave}
      />
    );
  return (
    <View className="bg-surface rounded-xl p-3">
      {(() => {
        const s = room ? peerStatus(room, tracks) : null;
        return s ? (
          <Txt className="text-muted mb-2 text-[12px]" numberOfLines={1}>
            {s}
          </Txt>
        ) : null;
      })()}
      <View className="gap-3">
        <View>
          <Txt className="mb-1 text-[12px]" numberOfLines={1}>
            {peerName ? `@${peerName}` : large ? 'Súper' : 'Súperova kamera'}
          </Txt>
          <div style={{ position: 'relative' }}>
            <div
              ref={remoteHost}
              style={{
                minHeight: remoteHeight,
                backgroundColor: palette.ink,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            />
            {!!rxSize && (
              <div
                style={{
                  position: 'absolute',
                  right: 8,
                  bottom: 8,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  color: '#fff',
                  fontSize: 11,
                }}
              >
                {rxSize}
              </div>
            )}
          </div>
        </View>
        {large && (
          <View>
            <Txt className="mb-1 text-[12px]">Tvoja kamera</Txt>
            <div style={{ position: 'relative' }}>
              <div
                ref={localHost}
                style={{
                  minHeight: 140,
                  backgroundColor: palette.ink,
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              />
              {camera && (
                <div
                  style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                    borderRadius: 6,
                    padding: '2px 6px',
                    color: '#fff',
                    fontSize: 11,
                  }}
                >
                  {['480p', '720p', '1080p'][pubTier]}
                </div>
              )}
            </div>
          </View>
        )}
      </View>
      {!!error && (
        <Txt className="text-danger mt-2 text-[12px]" accessibilityRole="alert">
          {error}
        </Txt>
      )}
      <VideoControls
        camera={camera}
        microphone={microphone}
        pending={pending}
        onCamera={() =>
          void control(() =>
            room.localParticipant.setCameraEnabled(!camera, {
              resolution: VideoPresets.h720,
              ...trackOptions(facing, deviceId),
            }),
          )
        }
        onMicrophone={() =>
          void control(async () => {
            const next = !microphone;
            await room.localParticipant.setMicrophoneEnabled(next);
            setMicrophone(next);
            onMicChange?.(next);
          })
        }
        onFlip={() =>
          void control(async () => {
            const next = facing === 'user' ? 'environment' : 'user';
            const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
            if (!(track instanceof LocalVideoTrack)) throw new Error('Najprv zapni kameru.');
            // Rozlíšenie drží aktuálne pásmo (auto-kvalita), nie pevných 720p.
            const res = videoPresets[videoTier.current].resolution;
            await track.restartTrack({
              facingMode: next,
              resolution: { width: res.width, height: res.height, frameRate: 30 },
            });
            setFacing(next);
            setDeviceId(undefined);
          })
        }
        onFocus={() => {
          void (async () => {
            if (!(await singleShotFocus(room))) {
              setError('Tento prehliadač nepodporuje ručné doostrenie — ostáva automatika.');
            } else {
              feedback.selection();
            }
          })();
        }}
        onLeave={onLeave}
      />
    </View>
  );
}

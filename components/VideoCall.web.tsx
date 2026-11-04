import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Room, RoomEvent, Track, ConnectionState, LocalVideoTrack } from 'livekit-client';
import { Txt } from '@/components/DartsUI';
import { VideoControls, VideoNotice } from '@/components/VideoUI';
import { feedback, palette } from '@/lib/darts';
import { getVideoCredentials } from '@/lib/video';
import type { VideoCallProps } from '@/components/VideoCall';

type MediaTrack = { track: Track | undefined; local: boolean };
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
}: VideoCallProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Pripájam…');
  const [request, setRequest] = useState({ matchId });
  const [tracks, setTracks] = useState<MediaTrack[]>([]);
  const [pending, setPending] = useState(false);
  const micRef = useRef(micWanted);
  micRef.current = micWanted;
  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(micWanted);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const currentRoom = useRef<Room | null>(null);
  const localHost = useRef<HTMLDivElement>(null);
  const remoteHost = useRef<HTMLDivElement>(null);
  const [previousSession, setPreviousSession] = useState(request);
  // Vlastné credentials (chat) cez refku, aby sa efekt nespúšťal dookola.
  const credsRef = useRef(getCredentials);
  credsRef.current = getCredentials;
  if (request.matchId !== matchId) setRequest({ matchId });
  if (previousSession !== request) {
    setPreviousSession(request);
    setError('');
    setRoom(null);
  }
  useEffect(() => {
    let active = true;
    const session = new Room({ adaptiveStream: true, dynacast: true });
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
      .on(RoomEvent.ParticipantDisconnected, update)
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (active)
          setStatus(
            state === ConnectionState.Connected
              ? 'Pripojený'
              : state === ConnectionState.Reconnecting
                ? 'Obnovujem spojenie…'
                : 'Odpojený',
          );
      });
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
        try {
          await session.localParticipant.setCameraEnabled(true);
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
  // Zmena z hornej obrazovky (prepínač mikrofónu) sa premietne do miestnosti.
  useEffect(() => {
    if (!room) return;
    if (room.localParticipant.isMicrophoneEnabled === microphone) return;
    // Priama synchronizácia (bez control): beží na pozadí pri zmene voľby.
    void room.localParticipant.setMicrophoneEnabled(microphone).catch(() => {
      feedback.error();
    });
  }, [microphone, room]);
  const remoteHeight = large ? 300 : 120; // kompaktné okno súpera, keď hádžem
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
        element.style.height = local ? '170px' : `${remoteHeight}px`;
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
      <Txt className="text-muted mb-2 text-[12px]">Video · {status}</Txt>
      <View className="gap-3">
        <View>
          <Txt className="mb-1 text-[12px]" numberOfLines={1}>
            {peerName ? `@${peerName}` : large ? 'Súper' : 'Súperova kamera'}
          </Txt>
          <div
            ref={remoteHost}
            style={{
              minHeight: remoteHeight,
              backgroundColor: palette.ink,
              borderRadius: 10,
              overflow: 'hidden',
            }}
          />
          {room.remoteParticipants.size === 0 && (
            <Txt className="text-muted mt-2 text-[12px]">
              Súper sa ešte nepripojil k videohovoru.
            </Txt>
          )}
        </View>
        {large && (
          <View>
            <Txt className="mb-1 text-[12px]">Tvoja kamera</Txt>
            <div
              ref={localHost}
              style={{
                minHeight: 170,
                backgroundColor: palette.ink,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            />
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
        onCamera={() => void control(() => room.localParticipant.setCameraEnabled(!camera))}
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
            await track.restartTrack({
              facingMode: next,
              resolution: { width: 640, height: 480, frameRate: 24 },
            });
            setFacing(next);
          })
        }
        onLeave={onLeave}
      />
    </View>
  );
}

import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Room,
  Track,
  ConnectionState,
  LocalVideoTrack,
  VideoPresets,
  ConnectionQuality,
  RoomEvent,
  type Participant,
} from 'livekit-client';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  registerGlobals,
  useTracks,
  isTrackReference,
  useLocalParticipant,
  useConnectionState,
  useParticipants,
} from '@livekit/react-native';
import { Txt } from '@/components/DartsUI';
import { VideoControls, VideoNotice } from '@/components/VideoUI';
import { getVideoCredentials, trackOptions, ensureCameraPermissions } from '@/lib/video';
import { feedback, palette } from '@/lib/darts';
import type { VideoCallProps } from '@/components/VideoCall';

registerGlobals();
let audioTransition = Promise.resolve();
function serializeAudio(action: () => Promise<void>): Promise<void> {
  const next = audioTransition.then(action);
  audioTransition = next.catch(() => undefined);
  return next;
}
function RoomContent({
  room,
  onLeave,
  large,
  micWanted,
  onMicChange,
  peerName,
  initialFacing,
  initialDeviceId,
}: {
  room: Room;
  onLeave: () => void;
  large: boolean;
  micWanted: boolean;
  onMicChange?: (on: boolean) => void;
  peerName?: string;
  initialFacing?: 'user' | 'environment';
  initialDeviceId?: string;
}) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  // Hádžem (nie som čakajúci): malé okno ukazuje SÚPEROVU kameru,
  // nie moju lokálnu – vidím jeho reakciu, keď čaká on.
  const shownTracks = large ? tracks : tracks.filter((t) => !t.participant.isLocal);
  // Ak súperovo video reálne svieti, diagnostiku skryjeme (neruší).
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  // Mikrofón drží stav zvolený hráčom (z hornej obrazovky) po celý zápas.
  // active vo refke spúšťa efekt len raz za zmenu; samotný setState sem nepatrí
  // (React error #310 = setState počas renderu = nekonečná slučka).
  const appliedMic = useRef(micWanted);
  useEffect(() => {
    if (appliedMic.current === micWanted || !localParticipant) return;
    appliedMic.current = micWanted;
    // Priama synchronizácia (bez control): beží na pozadí pri zmene voľby.
    void localParticipant.setMicrophoneEnabled(micWanted).catch(() => {
      feedback.error();
    });
  }, [micWanted, localParticipant]);
  const state = useConnectionState();
  const participants = useParticipants();
  // Diagnostika súperovho obrazu (vidí ju aj hráč — podľa nej spoznáme, kde to viazne).
  const peer = participants.find((p) => !p.isLocal);
  const peerPub = peer?.getTrackPublication(Track.Source.Camera);
  const peerStatus = !peer
    ? 'Súper sa ešte nepripojil'
    : !peerPub
      ? 'Súper je pripojený, kameru nevysiela'
      : peerPub.isMuted
        ? 'Súper má vypnutú kameru'
        : !peerPub.isSubscribed
          ? 'Čakám na súperov obraz…'
          : 'Súperov obraz sa načítava…';
  // Kamera sa zapne sama hneď po pripojení (aj u priateľa) —
  // doteraz ostávala vypnutá, kým ju niekto ručne nezapol.
  const autoCam = useRef(false);
  useEffect(() => {
    if (state !== ConnectionState.Connected || autoCam.current) return;
    autoCam.current = true;
    void (async () => {
      // Android: bez povolenia systému kamera vôbec neštartuje.
      if (!(await ensureCameraPermissions())) {
        setCamError('Kamera nemá povolenie systému — povoľ ju v nastaveniach telefónu.');
        return;
      }
      const facingMode = initialFacing ?? 'user';
    // Najprv konkrétne zariadenie, pri neúspechu strana (staré/blokované id).
    const enable = (deviceId?: string) =>
      room.localParticipant.setCameraEnabled(true, {
        resolution: VideoPresets.h720,
        ...trackOptions(facingMode, deviceId),
      });
    void enable(initialDeviceId)
      .catch(() => (initialDeviceId ? enable(undefined) : Promise.reject(new Error('blocked'))))
      .catch((e) => {
        const blocked =
          e instanceof Error &&
          /notallowed|denied|permission/i.test(e.message || e.name);
        setCamError(
          blocked
            ? 'Kamera je zablokovaná — povoľ ju v prehliadači a zapni ju tlačidlom nižšie.'
            : 'Kameru sa nepodarilo zapnúť. Skús ju zapnúť tlačidlom nižšie.',
        );
      });
    })();
  }, [state, room, initialFacing, initialDeviceId]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [camError, setCamError] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>(initialFacing ?? 'user');
  const control = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    setError('');
    setCamError('');
    try {
      await action();
      feedback.selection();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kamera alebo mikrofón nie sú dostupné.');
      feedback.error();
    } finally {
      setPending(false);
    }
  };
  return (
    <View className="bg-surface rounded-xl p-3">
      {!shownTracks.some(
        (t) => !t.participant.isLocal && isTrackReference(t) && !t.publication.isMuted,
      ) && (
        <Txt className="text-muted mb-2 text-[12px]" numberOfLines={1}>
          {peerStatus}
        </Txt>
      )}
      {shownTracks.map((track) => {
        // Súperovo okno maximalizujeme, vlastné o 10 % menšie — obe vidno aj so skóre.
        const h = track.participant.isLocal ? (large ? 150 : 120) : large ? 230 : 150;
        return (
        <View key={track.participant.identity} className="mb-2">
          <Txt className="mb-1 text-[12px]" numberOfLines={1}>
            {track.participant.isLocal
              ? 'Tvoja kamera'
              : peerName
                ? `@${peerName}`
                : `@${track.participant.name || track.participant.identity}`}
          </Txt>
          {isTrackReference(track) && !track.publication.isMuted ? (
            <VideoTrack
              trackRef={track}
              objectFit={large ? 'contain' : 'cover'}
              style={{ height: h, width: '100%', backgroundColor: palette.ink, borderRadius: 10 }}
            />
          ) : (
            <View
              style={{ height: h }}
              className="bg-ink items-center justify-center rounded-xl"
            >
              <Txt className="text-on-ink">Kamera je vypnutá</Txt>
            </View>
          )}
        </View>
        );
      })}
      {large && participants.length < 2 && (
        <Txt className="text-muted text-[12px]">Súper sa ešte nepripojil k videohovoru.</Txt>
      )}
      {!!camError && (
        <Txt className="text-danger mt-2 text-[13px]" accessibilityRole="alert">
          {camError}
        </Txt>
      )}
      {!!error && (
        <Txt className="text-danger mt-2 text-[12px]" accessibilityRole="alert">
          {error}
        </Txt>
      )}
      <VideoControls
        camera={isCameraEnabled}
        microphone={isMicrophoneEnabled}
        pending={pending}
        onCamera={() =>
          void control(() =>
            localParticipant.setCameraEnabled(!isCameraEnabled, {
              resolution: VideoPresets.h720,
              ...trackOptions(facing, deviceId),
            }),
          )
        }
        onMicrophone={() =>
          void control(async () => {
            const next = !appliedMic.current;
            await localParticipant.setMicrophoneEnabled(next);
            appliedMic.current = next;
            onMicChange?.(next);
          })
        }
        onFlip={() =>
          void control(async () => {
            const next = facing === 'user' ? 'environment' : 'user';
            const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
            if (!(track instanceof LocalVideoTrack)) throw new Error('Najprv zapni kameru.');
            // Rozlíšenie drží aktuálne pásmo (auto-kvalita), nie pevných 720p.
            const res = [VideoPresets.h480, VideoPresets.h720, VideoPresets.h1080][
              videoTier.current
            ].resolution;
            await track.restartTrack({
              facingMode: next,
              resolution: { width: res.width, height: res.height, frameRate: 30 },
            });
            setFacing(next);
            setDeviceId(undefined);
          })
        }
        onLeave={onLeave}
      />
    </View>
  );
}
export default function NativeVideoCall({
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
  const [credentials, setCredentials] = useState<Awaited<
    ReturnType<typeof getVideoCredentials>
  > | null>(null);
  const [error, setError] = useState('');
  const [request, setRequest] = useState({ matchId });
  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: { pixelDensity: 'screen' },
        dynacast: true,
        videoCaptureDefaults: { resolution: VideoPresets.h720 },
      }),
  );
  // Automatická kvalita videa podľa internetu: 480p ↔ 720p ↔ 1080p.
  // Štart je 720p; prepína sa len pri zmene pásma + max raz za 8 s (nekmitá).
  const videoTier = useRef(1);
  useEffect(() => {
    const presets = [VideoPresets.h480, VideoPresets.h720, VideoPresets.h1080];
    let cooling = false;
    const apply = (quality: ConnectionQuality) => {
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
        const res = presets[tier].resolution;
        // restartTrack bez zdroja by prepol na prednú kameru — držíme stranu aj zariadenie.
        void track
          .restartTrack({
            resolution: { width: res.width, height: res.height, frameRate: 30 },
            ...trackOptions(facing, deviceId),
          })
          .catch(() => undefined);
      }
    };
    const handler = (quality: ConnectionQuality, participant: Participant) => {
      if (participant.isLocal) apply(quality);
    };
    room.on(RoomEvent.ConnectionQualityChanged, handler);
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, handler);
    };
  }, [room, facing, deviceId]);
  const [previousSession, setPreviousSession] = useState(request);
  if (request.matchId !== matchId) setRequest({ matchId });
  if (previousSession !== request) {
    setPreviousSession(request);
    setError('');
    setCredentials(null);
  }
  useEffect(() => {
    let mounted = true;
    let ownsAudio = false;
    void (async () => {
      try {
        const data = await (getCredentials ? getCredentials() : getVideoCredentials(request.matchId));
        if (!mounted) return;
        await serializeAudio(async () => {
          if (!mounted) return;
          ownsAudio = true;
          try {
            await AudioSession.startAudioSession();
          } catch (e) {
            await AudioSession.stopAudioSession().catch(() => undefined);
            ownsAudio = false;
            throw e;
          }
          if (mounted) setCredentials(data);
        });
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : 'Video sa nepodarilo pripojiť.');
          feedback.error();
        }
      }
    })();
    return () => {
      mounted = false;
      void serializeAudio(async () => {
        try {
          await room.disconnect();
        } finally {
          if (ownsAudio) {
            ownsAudio = false;
            await AudioSession.stopAudioSession();
          }
        }
      }).catch(() => undefined);
    };
  // room vzniká raz (useState inicializátor) a nikdy sa nemení — v závislostiach
  // je kvôli cleanupu (odpojenie), ale re-rendery navyše nespôsobuje.
  }, [request.matchId, room, getCredentials]);
  if (!credentials)
    return (
      <VideoNotice
        error={error}
        pending={!error}
        retry={() => setRequest({ matchId })}
        leave={onLeave}
      />
    );
  return (
    <View>
      {!!error && (
        <Txt className="text-danger mb-2 text-[13px]" accessibilityRole="alert">
          {error}
        </Txt>
      )}
      <LiveKitRoom
        room={room}
        serverUrl={credentials.url}
        token={credentials.token}
        connect
        audio={micWanted}
        video
        onError={(e) => {
          setError(e.message);
          feedback.error();
        }}
        onDisconnected={() => {
          setError('Videohovor je odpojený. V hre môžeš pokračovať bez kamery.');
          feedback.error();
        }}
      >
        <RoomContent
          room={room}
          onLeave={onLeave}
          large={large ?? false}
          micWanted={micWanted}
          onMicChange={onMicChange}
          peerName={peerName}
          initialFacing={initialFacing}
          initialDeviceId={initialDeviceId}
        />
      </LiveKitRoom>
    </View>
  );
}

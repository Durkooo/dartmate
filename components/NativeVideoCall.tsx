import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Room,
  Track,
  ConnectionState,
  LocalVideoTrack,
  RemoteTrackPublication,
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
import { Phone } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { Button } from 'heroui-native';
import { VideoControls, VideoNotice } from '@/components/VideoUI';
import {
  getVideoCredentials,
  trackOptions,
  ensureCameraPermissions,
  singleShotFocus,
  VIDEO_PRESETS,
} from '@/lib/video';
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
  audioOnly,
  micWanted,
  onMicChange,
  peerName,
  initialFacing,
  initialDeviceId,
}: {
  room: Room;
  onLeave: () => void;
  large: boolean;
  audioOnly: boolean;
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
  const publication = peer?.getTrackPublication(Track.Source.Camera);
  const peerPub = publication instanceof RemoteTrackPublication ? publication : undefined;
  const peerVideoShowing = shownTracks.some(
    (t) => !t.participant.isLocal && isTrackReference(t) && !t.publication.isMuted,
  );
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
  const [camError, setCamError] = useState('');
  useEffect(() => {
    if (audioOnly || state !== ConnectionState.Connected || autoCam.current) return;
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
            e instanceof Error && /notallowed|denied|permission/i.test(e.message || e.name);
          setCamError(
            blocked
              ? 'Kamera je zablokovaná — povoľ ju v prehliadači a zapni ju tlačidlom nižšie.'
              : 'Kameru sa nepodarilo zapnúť. Skús ju zapnúť tlačidlom nižšie.',
          );
        });
    })();
  }, [state, room, initialFacing, initialDeviceId, audioOnly]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>(initialFacing ?? 'user');
  const [deviceId, setDeviceId] = useState<string | undefined>(initialDeviceId);
  // Automatická kvalita videa podľa internetu: 480p ↔ 720p ↔ 1080p.
  // Štart je 720p; prepína sa len pri zmene pásma + max raz za 8 s (nekmitá).
  const videoTier = useRef(1);
  const [pubTier, setPubTier] = useState(1);
  useEffect(() => {
    const presets = VIDEO_PRESETS;
    let cooling = false;
    const apply = (quality: ConnectionQuality) => {
      const tier =
        quality === ConnectionQuality.Excellent ? 2 : quality === ConnectionQuality.Good ? 1 : 0;
      if (tier === videoTier.current || cooling) return;
      videoTier.current = tier;
      setPubTier(tier);
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
  // Skutočné prijaté rozlíšenie súperovho obrazu (obnovuje sa každé 3 s).
  const [rxSize, setRxSize] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const remote = tracks.find(
          (t) => !t.participant.isLocal && isTrackReference(t) && !t.publication.isMuted,
        );
        const rt = remote && isTrackReference(remote) ? remote.publication.track : undefined;
        const ms = rt?.mediaStreamTrack;
        const s = typeof ms?.getSettings === 'function' ? ms.getSettings() : {};
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
  }, [tracks]);
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
      {audioOnly ? (
        <View className="items-center gap-3 py-5">
          <Phone size={32} strokeWidth={1.8} color={palette.ink} />
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
            {peerName ? `@${peerName}` : 'Hlasový hovor'}
          </Txt>
          <Txt className="text-muted text-[13px]">
            {peer ? 'Hovor prebieha' : 'Čakám na priateľa…'}
          </Txt>
        </View>
      ) : (
        <>
          {!peerVideoShowing && (
            <Txt className="text-muted mb-2 text-[12px]" numberOfLines={1}>
              {peerStatus}
            </Txt>
          )}
          {shownTracks.map((track) => {
            // Súperovo okno maximalizujeme, vlastné o 10 % menšie — obe vidno aj so skóre.
            // Odznak v rohu ukazuje živé rozlíšenie (vlastné = vysielané pásmo).
            const isLocalTrack = track.participant.isLocal;
            const h = isLocalTrack ? (large ? 140 : 120) : large ? 280 : 150;
            const showing = isTrackReference(track) && !track.publication.isMuted;
            const badge = !showing
              ? ''
              : isLocalTrack
                ? ['480p', '720p', '1080p'][pubTier]
                : rxSize;
            return (
              <View key={track.participant.identity} className="mb-2">
                <Txt className="mb-1 text-[12px]" numberOfLines={1}>
                  {track.participant.isLocal
                    ? 'Tvoja kamera'
                    : peerName
                      ? `@${peerName}`
                      : `@${track.participant.name || track.participant.identity}`}
                </Txt>
                {showing && isTrackReference(track) ? (
                  <View style={{ position: 'relative', height: h }}>
                    <VideoTrack
                      trackRef={track}
                      objectFit={large ? 'contain' : 'cover'}
                      style={{
                        height: h,
                        width: '100%',
                        backgroundColor: palette.navy,
                        borderRadius: 10,
                      }}
                    />
                    {!!badge && (
                      <View
                        style={{
                          position: 'absolute',
                          right: 8,
                          bottom: 8,
                          backgroundColor: 'rgba(0,0,0,0.55)',
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Txt style={{ color: '#fff', fontSize: 11 }}>{badge}</Txt>
                      </View>
                    )}
                  </View>
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
          {/* Obnova zaseknutého odberu: krátko odhlási a znova prihlási súperov obraz.
          Zdravý prenos to len žmurkne, zaseknutý sa tým často preberie. */}
          {large && !!peer && !peerVideoShowing && !!peerPub && !peerPub.isMuted && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-2"
              accessibilityLabel="Obnoviť obraz súpera"
              onPress={() => {
                const pub = peerPub;
                void (async () => {
                  try {
                    pub.setSubscribed(false);
                  } catch {
                    // Odhlásenie nemusí prejsť — skúsime aspoň prihlásenie.
                  }
                  await new Promise((r) => setTimeout(r, 400));
                  try {
                    pub.setSubscribed(true);
                  } catch {
                    setError('Obraz sa nepodarilo obnoviť. Skús vypnúť a zapnúť kameru.');
                    feedback.error();
                    return;
                  }
                  feedback.selection();
                })();
              }}
            >
              <Button.Label>Obnoviť obraz súpera</Button.Label>
            </Button>
          )}
          {large && participants.length < 2 && (
            <Txt className="text-muted text-[12px]">Súper sa ešte nepripojil k videohovoru.</Txt>
          )}
        </>
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
        audioOnly={audioOnly}
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
            const res = VIDEO_PRESETS[videoTier.current].resolution;
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
              setCamError('Tento telefón nepodporuje ručné doostrenie — ostáva automatika.');
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
export default function NativeVideoCall({
  matchId,
  onLeave,
  large,
  audioOnly = false,
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
  const roomRef = useRef(room);
  const [previousSession, setPreviousSession] = useState(request);
  if (request.matchId !== matchId) setRequest({ matchId });
  if (previousSession !== request) {
    setPreviousSession(request);
    setError('');
    setCredentials(null);
  }
  useEffect(() => {
    const sessionRoom = roomRef.current;
    let mounted = true;
    let ownsAudio = false;
    void (async () => {
      try {
        const data = await (getCredentials
          ? getCredentials()
          : getVideoCredentials(request.matchId));
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
          await sessionRoom.disconnect();
        } finally {
          if (ownsAudio) {
            ownsAudio = false;
            await AudioSession.stopAudioSession();
          }
        }
      }).catch(() => undefined);
    };
  }, [request, getCredentials]);
  if (!credentials)
    return (
      <VideoNotice
        audioOnly={audioOnly}
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
        video={!audioOnly}
        onError={(e) => {
          setError(e.message);
          feedback.error();
        }}
        onDisconnected={() => {
          setError(
            audioOnly
              ? 'Hovor je odpojený. Skús sa pripojiť znova.'
              : 'Videohovor je odpojený. V hre môžeš pokračovať bez kamery.',
          );
          feedback.error();
        }}
      >
        <RoomContent
          room={room}
          onLeave={onLeave}
          large={large ?? false}
          audioOnly={audioOnly}
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

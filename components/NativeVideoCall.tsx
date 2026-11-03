import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Room, Track, ConnectionState, LocalVideoTrack } from 'livekit-client';
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
import { getVideoCredentials } from '@/lib/video';
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
}: {
  room: Room;
  onLeave: () => void;
  large: boolean;
}) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  // Hádžem (nie som čakajúci): malé okno ukazuje SÚPEROVU kameru,
  // nie moju lokálnu – vidím jeho reakciu, keď čaká on.
  const shownTracks = large ? tracks : tracks.filter((t) => !t.participant.isLocal);
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const state = useConnectionState();
  const participants = useParticipants();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const control = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    setError('');
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
      <Txt className="text-muted mb-2 text-[12px]">
        Video ·{' '}
        {state === ConnectionState.Connected
          ? 'Pripojený'
          : state === ConnectionState.Reconnecting
            ? 'Obnovujem spojenie…'
            : 'Pripájam…'}
      </Txt>
      {shownTracks.map((track) => (
        <View key={track.participant.identity} className="mb-3">
          <Txt className="mb-1 text-[12px]" numberOfLines={1}>
            {large
              ? track.participant.isLocal
                ? 'Tvoja kamera'
                : `@${track.participant.name || track.participant.identity}`
              : `@${track.participant.name || track.participant.identity}`}
          </Txt>
          {isTrackReference(track) && !track.publication.isMuted ? (
            <VideoTrack
              trackRef={track}
              objectFit={large ? 'contain' : 'cover'}
              style={{ height: large ? 170 : 120, width: '100%', backgroundColor: palette.ink, borderRadius: 10 }}
            />
          ) : (
            <View
              className={`bg-ink items-center justify-center rounded-xl ${large ? 'h-[170px]' : 'h-[120px]'}`}
            >
              <Txt className="text-on-ink">Kamera je vypnutá</Txt>
            </View>
          )}
        </View>
      ))}
      {large && participants.length < 2 && (
        <Txt className="text-muted text-[12px]">Súper sa ešte nepripojil k videohovoru.</Txt>
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
        onCamera={() => void control(() => localParticipant.setCameraEnabled(!isCameraEnabled))}
        onMicrophone={() =>
          void control(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))
        }
        onFlip={() =>
          void control(async () => {
            const next = facing === 'user' ? 'environment' : 'user';
            const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
            if (!(track instanceof LocalVideoTrack)) throw new Error('Najprv zapni kameru.');
            await track.restartTrack({ facingMode: next });
            setFacing(next);
          })
        }
        onLeave={onLeave}
      />
    </View>
  );
}
export default function NativeVideoCall({ matchId, onLeave, large }: VideoCallProps) {
  const [credentials, setCredentials] = useState<Awaited<
    ReturnType<typeof getVideoCredentials>
  > | null>(null);
  const [error, setError] = useState('');
  const [request, setRequest] = useState({ matchId });
  const [room] = useState(
    () => new Room({ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true }),
  );
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
        const data = await getVideoCredentials(request.matchId);
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
    // eslint-disable-next-line react/exhaustive-effect-dependencies -- room is stable state, but react-hooks/exhaustive-deps requires it here.
  }, [request, room]);
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
        audio
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
        <RoomContent room={room} onLeave={onLeave} large={large} />
      </LiveKitRoom>
    </View>
  );
}

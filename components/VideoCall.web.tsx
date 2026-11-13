import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  RemoteTrackPublication,
  type TrackPublication,
  VideoPresets,
  ConnectionQuality,
  type Participant,
} from 'livekit-client';
import {
  trackOptions,
  singleShotFocus,
  VIDEO_PRESETS,
  isCameraBusy,
  waitForCameraWarmUp,
  withCameraRetry,
} from '@/lib/video';
import { Button } from 'heroui-native';
import { Phone } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { VideoControls, VideoNotice } from '@/components/VideoUI';
import { feedback, palette } from '@/lib/darts';
import { getVideoCredentials } from '@/lib/video';
import type { VideoCallProps } from '@/components/VideoCall';

type MediaTrack = { track: Track | undefined; local: boolean };
/** Stav súperovho obrazu pre diagnostiku (null = video svieti, netreba nič). */
function peerStatus(room: Room, tracks: MediaTrack[]): string | null {
  // Len video — súperov mikrofón neznamená, že vidno jeho obraz.
  if (tracks.some((t) => !t.local && t.track?.kind === Track.Kind.Video && !t.track.isMuted))
    return null;
  const peer = [...room.remoteParticipants.values()][0];
  if (!peer) return 'Súper sa ešte nepripojil';
  const pub = peer.getTrackPublication(Track.Source.Camera);
  if (!pub) return 'Súper je pripojený, kameru nevysiela';
  if (pub.isMuted) return 'Súper má vypnutú kameru';
  return !pub.isSubscribed ? 'Čakám na súperov obraz…' : 'Súperov obraz sa načítava…';
}
/** DOČASNÁ diagnostika hovoru (malý riadok pod hovorom) — ukáže, čo vidí každý
 *  telefón: moje zverejnené stopy a stopy súpera. Po vyriešení kamery odstrániť. */
function pubInfo(p: TrackPublication | undefined): string {
  if (!p) return '–';
  let out = p.trackSid ? 'ok' : 'čaká';
  if (p.isMuted) out += ',mute';
  if (p instanceof RemoteTrackPublication) out += p.isSubscribed ? ',sub' : ',nesub';
  if (p.track?.mediaStreamTrack) out += `,${p.track.mediaStreamTrack.readyState}`;
  if (p.mimeType) out += `,${p.mimeType.replace(/^video\/|^audio\//, '')}`;
  return out;
}
function diagnostics(room: Room, camErrors: string[], sender: string): string {
  const me = room.localParticipant;
  const parts = [
    `ja cam:${pubInfo(me.getTrackPublication(Track.Source.Camera))} mic:${pubInfo(me.getTrackPublication(Track.Source.Microphone))}`,
  ];
  const remotes = [...room.remoteParticipants.values()];
  parts.push(`súperi:${remotes.length}`);
  for (const p of remotes)
    parts.push(
      `${p.identity.slice(0, 6)} cam:${pubInfo(p.getTrackPublication(Track.Source.Camera))} mic:${pubInfo(p.getTrackPublication(Track.Source.Microphone))} stôp:${p.trackPublications.size}`,
    );
  if (sender) parts.push(sender);
  if (camErrors.length) parts.push(`chyba:${camErrors.at(-1)}`);
  return parts.join(' | ');
}
/** Náhradné vysielanie kamery cez plátno: niektoré Androidy ukážu obraz kamery
 *  v náhľade, ale do odosielania nepustia ani snímku (kam:0). Obraz sa preto
 *  prekresľuje z (neviditeľného) videa do plátna a do hovoru ide stopa z plátna. */
function createCanvasRelay(source: MediaStreamTrack) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = new MediaStream([source]);
  // Musí byť v stránke, inak ho niektoré prehliadače neprehrávajú.
  Object.assign(video.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '2px',
    height: '2px',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(video);
  void video.play().catch(() => undefined);
  const canvas = document.createElement('canvas');
  const settings = source.getSettings();
  canvas.width = settings.width || 1280;
  canvas.height = settings.height || 720;
  const ctx = canvas.getContext('2d');
  const timer = setInterval(() => {
    if (!ctx || video.readyState < 2) return;
    if (
      video.videoWidth &&
      (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }, 33);
  const track = canvas.captureStream(30).getVideoTracks()[0];
  return {
    track,
    stop: () => {
      clearInterval(timer);
      track.stop();
      source.stop();
      video.srcObject = null;
      video.remove();
    },
  };
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

function removeElement(track: Track, element: HTMLMediaElement) {
  track.detach(element);
  element.pause();
  element.srcObject = null;
  element.remove();
}

export default function VideoCall({
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
  endWhenPeerLeaves = false,
  onPeerJoined,
}: VideoCallProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState('');
  const [request, setRequest] = useState({ matchId });
  const [tracks, setTracks] = useState<MediaTrack[]>([]);
  const [peerInfo, setPeerInfo] = useState<string | null>(null);
  const [diag, setDiag] = useState('');
  const camErrors = useRef<string[]>([]);
  const senderInfo = useRef('');
  /** Kamera ide cez plátno — reštart kamery (kvalita, otočenie) by ho zrušil. */
  const relayActive = useRef(false);
  const [pending, setPending] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const micRef = useRef(micWanted);
  useEffect(() => {
    micRef.current = micWanted;
  }, [micWanted]);
  // Automatická kvalita videa podľa internetu: 480p ↔ 720p ↔ 1080p (max raz za 8 s).
  const videoTier = useRef(1);
  const [pubTier, setPubTier] = useState(1);
  const [rxSize, setRxSize] = useState('');
  const [deviceId, setDeviceId] = useState<string | undefined>(initialDeviceId);
  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(micWanted);
  const [facing, setFacing] = useState<'user' | 'environment'>(initialFacing ?? 'user');
  // Aktuálna kamera pre poistku v efekte miestnosti (bez jeho reštartu).
  const cameraChoice = useRef({ facing, deviceId });
  useEffect(() => {
    cameraChoice.current = { facing, deviceId };
  }, [facing, deviceId]);
  const currentRoom = useRef<Room | null>(null);
  const localHost = useRef<HTMLDivElement>(null);
  const remoteHost = useRef<HTMLDivElement>(null);
  const [previousSession, setPreviousSession] = useState(request);
  // Najnovšie onLeave / endWhenPeerLeaves pre udalosti miestnosti (bez reštartu efektu).
  const leaveRef = useRef(onLeave);
  const endRef = useRef(endWhenPeerLeaves);
  const joinedRef = useRef(onPeerJoined);
  useEffect(() => {
    leaveRef.current = onLeave;
    endRef.current = endWhenPeerLeaves;
    joinedRef.current = onPeerJoined;
  }, [onLeave, endWhenPeerLeaves, onPeerJoined]);
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
      // Hovor dvoch ľudí: bez šetrenia dát. S adaptiveStream iPhone (Safari)
      // hlásil, že video nie je viditeľné, a s dynacast server potom Androidu
      // vypol vysielanie kamery — odoslané 0 snímok, u priateľa čierne okno.
      adaptiveStream: false,
      dynacast: false,
      videoCaptureDefaults: { resolution: VideoPresets.h720 },
    });
    const fail = (e: unknown) => {
      if (active) {
        setError(e instanceof Error ? e.message : 'Hovor sa nepodarilo pripojiť.');
        feedback.error();
      }
    };
    const update = () => {
      if (active) {
        const next = snapshotTracks(session).filter(
          ({ track }) => !audioOnly || track?.kind === Track.Kind.Audio,
        );
        // Text stavu súpera počítame tu (mení sa aj bez zmeny stôp — napr. zverejnená,
        // ale ešte neodobratá kamera); rovnaký reťazec React neprekreslí.
        setPeerInfo(peerStatus(session, next));
        setDiag(diagnostics(session, camErrors.current, senderInfo.current));
        // Rovnaké stopy v rovnakom stave → bez prekreslenia (pravidelná obnova).
        setTracks((prev) =>
          prev.length === next.length &&
          prev.every(
            (t, i) =>
              t.track === next[i].track &&
              t.local === next[i].local &&
              t.track?.isMuted === next[i].track?.isMuted,
          )
            ? prev
            : next,
        );
        setAudioBlocked(!session.canPlaybackAudio);
        setCamera(session.localParticipant.isCameraEnabled);
        setMicrophone(session.localParticipant.isMicrophoneEnabled);
      }
    };
    const disconnected = () => {
      if (!active) return;
      active = false;
      currentRoom.current = null;
      setRoom(null);
      setTracks([]);
      setError(
        audioOnly
          ? 'Hovor je odpojený. Skús sa pripojiť znova.'
          : 'Videohovor je odpojený. Skús ho pripojiť znova; v hre môžeš pokračovať bez kamery.',
      );
      feedback.error();
    };
    session
      .on(RoomEvent.AudioPlaybackStatusChanged, update)
      .on(RoomEvent.Disconnected, disconnected)
      .on(RoomEvent.TrackSubscribed, update)
      .on(RoomEvent.TrackUnsubscribed, update)
      .on(RoomEvent.LocalTrackPublished, update)
      .on(RoomEvent.LocalTrackUnpublished, update)
      .on(RoomEvent.TrackMuted, update)
      .on(RoomEvent.TrackUnmuted, update)
      .on(RoomEvent.ParticipantConnected, update)
      .on(RoomEvent.ParticipantDisconnected, update)
      // Súper zapne kameru až po pripojení → bez týchto udalostí ostal na iPhone
      // starý stav „kameru nevysiela“ a obraz sa nikdy nevykreslil.
      .on(RoomEvent.TrackPublished, update)
      .on(RoomEvent.TrackUnpublished, update)
      .on(RoomEvent.TrackSubscriptionFailed, update)
      .on(RoomEvent.TrackSubscriptionStatusChanged, update);
    // Poistka: stav miestnosti obnovíme aj pravidelne (keby nejaká udalosť nedorazila).
    // Poistka pre Android: kamera je zverejnená, ale kodér neodoslal ani jednu snímku
    // (server ju potom ostatným vôbec neukáže — iPhone hlási „kameru nevysiela“).
    // Po 8 s bez snímok kameru znova zverejníme v jednej kvalite (bez simulcastu),
    // ktorú zvládnu aj slabšie kodéry v telefónoch. Funkčné kamery sa to netýka.
    let zeroSince: number | undefined;
    // Poistky pri 0 snímkach: 1 = znova v 1 kvalite (VP8), 2 = kodek H.264,
    // 3 = kodek VP9. Každá po 8 s bez snímok; funkčné kamery sa to netýka.
    let fallbackStage = 0;
    // Náhradné vysielanie cez plátno (pri kam:0), zastaví sa s hovorom.
    let relay: ReturnType<typeof createCanvasRelay> | null = null;
    const FALLBACKS = [
      { label: '1 kvalita VP8', codec: 'vp8' },
      { label: 'kodek H.264', codec: 'h264' },
      { label: 'kodek VP9', codec: 'vp9' },
    ] as const;
    let checking = false;
    const checkSender = async () => {
      if (checking || !active) return;
      checking = true;
      try {
        const pub = session.localParticipant.getTrackPublication(Track.Source.Camera);
        const track = pub?.track;
        if (!(track instanceof LocalVideoTrack) || !pub?.trackSid || pub.isMuted) {
          zeroSince = undefined;
          senderInfo.current = '';
          return;
        }
        const stats = await track.getSenderStats().catch(() => []);
        const frames = stats.reduce((sum, st) => sum + (st.framesSent ?? 0), 0);
        const kb = Math.round(stats.reduce((sum, st) => sum + (st.bytesSent ?? 0), 0) / 1024);
        const limit = stats.find((st) => st.qualityLimitationReason)?.qualityLimitationReason;
        // Zapnuté vrstvy vysielania (1 = posiela, 0 = vypnutá serverom/prehliadačom).
        let layersOn = '';
        try {
          const enc = track.sender?.getParameters().encodings ?? [];
          layersOn = enc.map((e) => (e.active === false ? '0' : '1')).join('');
        } catch {
          layersOn = '?';
        }
        // Surové údaje prehliadača: snímky z kamery do kodéra, zakódované snímky,
        // kodér a kodek — ukážu, kde presne sa video zastaví.
        let raw = '';
        let sourceFrames = -1;
        try {
          const report = await track.sender?.getStats();
          let source = 0;
          let encoded = 0;
          let impl = '';
          let codec = '';
          report?.forEach((r: Record<string, unknown>) => {
            if (r.type === 'media-source' && r.kind === 'video')
              source = Math.max(source, Number(r.frames ?? r.framesPerSecond ?? 0));
            if (r.type === 'outbound-rtp' && r.kind === 'video') {
              encoded += Number(r.framesEncoded ?? 0);
              if (typeof r.encoderImplementation === 'string') impl = r.encoderImplementation;
              if (typeof r.codecId === 'string') {
                const c: unknown = report.get(r.codecId);
                const mime = c && typeof c === 'object' ? Reflect.get(c, 'mimeType') : undefined;
                if (typeof mime === 'string') codec = mime.replace('video/', '');
              }
            }
          });
          sourceFrames = source;
          raw = ` kam:${source} kód:${encoded}${impl ? ` ${impl}` : ''}${codec ? ` ${codec}` : ''}`;
        } catch {
          raw = '';
        }
        senderInfo.current = `odoslané:${frames}sn ${kb}kB vrstvy:${stats.length}${layersOn ? ` zap:${layersOn}` : ''}${limit ? ` obmedz:${limit}` : ''}${raw}${relay ? ' (cez plátno)' : fallbackStage ? ` (${FALLBACKS[fallbackStage - 1].label})` : ''}`;
        if (frames > 0) {
          zeroSince = undefined;
          return;
        }
        zeroSince ??= Date.now();
        if (Date.now() - zeroSince < 8000) return;
        // Z kamery nepríde do odosielania ani snímka → iný kodek nepomôže,
        // pošleme obraz cez plátno (z náhľadu, ktorý funguje).
        if (sourceFrames === 0 && !relay) {
          zeroSince = undefined;
          camErrors.current.push('kam:0 → kamera cez plátno');
          const source = track.mediaStreamTrack;
          await session.localParticipant.unpublishTrack(track, false);
          if (!active) {
            source.stop();
            return;
          }
          relay = createCanvasRelay(source);
          relayActive.current = true;
          await session.localParticipant.publishTrack(relay.track, {
            source: Track.Source.Camera,
            simulcast: false,
            videoCodec: 'vp8',
          });
          return;
        }
        if (relay || fallbackStage >= FALLBACKS.length) return;
        const next = FALLBACKS[fallbackStage];
        fallbackStage += 1;
        zeroSince = undefined;
        camErrors.current.push(`0 snímok → kamera znova (${next.label})`);
        const { facing: f, deviceId: d } = cameraChoice.current;
        await session.localParticipant.unpublishTrack(track, true);
        if (!active) return;
        await withCameraRetry(() =>
          session.localParticipant.setCameraEnabled(
            true,
            { resolution: VIDEO_PRESETS[videoTier.current].resolution, ...trackOptions(f, d) },
            { simulcast: false, videoCodec: next.codec },
          ),
        );
      } catch (e) {
        camErrors.current.push(
          e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 80) : String(e),
        );
      } finally {
        checking = false;
      }
    };
    const refresh = setInterval(() => {
      void checkSender();
      update();
    }, 2000);
    // Chat-hovor: keď priateľ hovor položí (odíde z miestnosti), ukončíme ho aj tu.
    // Krátka pauza, aby krátky výpadok siete hovor hneď neukončil.
    let peerSeen = false;
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    session
      .on(RoomEvent.ParticipantConnected, () => {
        peerSeen = true;
        clearTimeout(leaveTimer);
        joinedRef.current?.();
      })
      .on(RoomEvent.ParticipantDisconnected, () => {
        if (!endRef.current || !peerSeen || session.remoteParticipants.size > 0) return;
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => {
          if (active && session.remoteParticipants.size === 0) {
            feedback.selection();
            leaveRef.current();
          }
        }, 2500);
      });
    void (async () => {
      try {
        const credentials = await (credsRef.current
          ? credsRef.current()
          : getVideoCredentials(request.matchId));
        if (!active) return;
        await session.connect(credentials.url, credentials.token);
        if (session.remoteParticipants.size > 0) {
          peerSeen = true;
          joinedRef.current?.();
        }
        if (!active) {
          await session.disconnect();
          return;
        }
        videoTier.current = 1;
        setPubTier(1);
        setRxSize('');
        setFacing(initialFacing ?? 'user');
        setDeviceId(initialDeviceId);
        currentRoom.current = session;
        setRoom(session);
        update();
        await session.startAudio();
        if (!active) {
          await session.disconnect();
          return;
        }
        if (!audioOnly) {
          const facingMode = initialFacing ?? 'user';
          const enableCam = (cameraDeviceId?: string) =>
            withCameraRetry(() =>
              session.localParticipant.setCameraEnabled(true, {
                resolution: VideoPresets.h720,
                ...(cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : { facingMode }),
              }),
            );
          // „Prebudenie“ kamery z ťuknutia ešte môže kameru držať (Android).
          await waitForCameraWarmUp();
          const note = (e: unknown) => {
            camErrors.current.push(
              e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 80) : String(e),
            );
          };
          try {
            await enableCam(initialDeviceId);
          } catch (first) {
            note(first);
            // Konkrétne zariadenie nemusí existovať — skús stranu.
            try {
              if (initialDeviceId) await enableCam(undefined);
              else throw first;
            } catch (e) {
              if (initialDeviceId) note(e);
              if (active) {
                const msg = e instanceof Error ? `${e.message} ${e.name}` : '';
                const blocked = /notallowed|denied|permission/i.test(msg);
                setError(
                  blocked
                    ? 'Kamera je zablokovaná — povoľ ju v prehliadači a zapni ju tlačidlom nižšie.'
                    : isCameraBusy(e)
                      ? 'Kameru drží iná aplikácia alebo karta. Zavri ju a zapni kameru tlačidlom nižšie.'
                      : 'Kameru sa nepodarilo zapnúť. Skús ju zapnúť tlačidlom nižšie.',
                );
              }
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
      clearInterval(refresh);
      relay?.stop();
      relay = null;
      relayActive.current = false;
      clearTimeout(leaveTimer);
      session.removeAllListeners();
      void session.disconnect();
    };
  }, [request, initialFacing, initialDeviceId, audioOnly]);
  // Auto-kvalita podľa internetu (vlastný efekt — vidí aktuálnu kameru).
  useEffect(() => {
    if (!room) return undefined;
    let active = true;
    // Prvých 8 s po pripojení nemeníme kvalitu: hneď po štarte hlási sieť
    // „výborná“ a reštart kamery na 1080p na mnohých Androidoch zlyhal → súper videl čiernu.
    let cooling = true;
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      cooling = false;
    }, 8000);
    const applyQuality = (quality: ConnectionQuality) => {
      const tier =
        quality === ConnectionQuality.Excellent ? 2 : quality === ConnectionQuality.Good ? 1 : 0;
      const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (
        tier === videoTier.current ||
        cooling ||
        relayActive.current ||
        !(track instanceof LocalVideoTrack) ||
        !room.localParticipant.isCameraEnabled
      )
        return;
      cooling = true;
      void withCameraRetry(() =>
        track.restartTrack({
          resolution: VIDEO_PRESETS[tier].resolution,
          ...trackOptions(facing, deviceId),
        }),
      )
        .then(() => {
          if (!active) return;
          videoTier.current = tier;
          setPubTier(tier);
        })
        .catch(async () => {
          // restartTrack najprv zastaví starú kameru — po zlyhaní by ostala mŕtva
          // (súper vidí čierne okno). Vrátime predošlú kvalitu, inak kameru znova zapneme.
          try {
            await withCameraRetry(() =>
              track.restartTrack({
                resolution: VIDEO_PRESETS[videoTier.current].resolution,
                ...trackOptions(facing, deviceId),
              }),
            );
          } catch {
            try {
              await room.localParticipant.setCameraEnabled(false);
              await withCameraRetry(() =>
                room.localParticipant.setCameraEnabled(true, {
                  resolution: VIDEO_PRESETS[videoTier.current].resolution,
                  ...trackOptions(facing, deviceId),
                }),
              );
            } catch {
              if (active) setError('Kamera sa zasekla. Vypni ju a znova zapni tlačidlom nižšie.');
            }
          }
        })
        .finally(() => {
          if (active)
            timer = setTimeout(() => {
              cooling = false;
            }, 8000);
        });
    };
    const qualityHandler = (quality: ConnectionQuality, participant: Participant) => {
      if (participant.isLocal) applyQuality(quality);
    };
    room.on(RoomEvent.ConnectionQualityChanged, qualityHandler);
    return () => {
      active = false;
      clearTimeout(timer);
      room.off(RoomEvent.ConnectionQualityChanged, qualityHandler);
    };
  }, [room, facing, deviceId]);
  useEffect(() => {
    if (!room) return undefined;
    const id = setInterval(() => {
      try {
        const pub = [...room.remoteParticipants.values()]
          .map((p) => p.getTrackPublication(Track.Source.Camera))
          .find((p) => p && !p.isMuted && p.track);
        const ms = pub?.track?.mediaStreamTrack;
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
  }, [room]);
  useEffect(() => {
    if (!room) return undefined;
    let active = true;
    // Apply the requested prop, not the observed microphone state.
    void room.localParticipant
      .setMicrophoneEnabled(micWanted)
      .then(() => {
        if (active && currentRoom.current === room)
          setMicrophone(room.localParticipant.isMicrophoneEnabled);
      })
      .catch(() => {
        if (active) feedback.error();
      });
    return () => {
      active = false;
    };
  }, [micWanted, room]);
  // Výšky podľa obrazovky: na iPhone sa celý hovor aj s ovládaním zmestí na displej
  // (pevných 440 px + vlastná kamera + tlačidlá vytlačilo ovládanie mimo obrazovky).
  const { height: windowHeight } = useWindowDimensions();
  const remoteHeight = large ? Math.round(Math.min(440, Math.max(200, windowHeight * 0.34))) : 160;
  const localHeight = Math.round(Math.min(140, Math.max(90, windowHeight * 0.15)));
  // Pripojené prvky <video>/<audio> podľa stopy. Držíme ich medzi rendermi:
  // predtým sa pri každej udalosti (odber mikrofónu, zmena stavu…) zničili a
  // vytvorili nanovo — iOS Safari potom nový prvok často nespustil (čierne okno).
  const attached = useRef(new Map<Track, { element: HTMLMediaElement; host: HTMLDivElement }>());
  const [remoteStuck, setRemoteStuck] = useState(false);
  // Spustí prehrávanie; iOS ho mimo gesta môže odmietnuť — vtedy ponúkneme tlačidlo.
  const playAll = (fromGesture: boolean) => {
    for (const [track, { element }] of attached.current) {
      if (track.kind !== Track.Kind.Video && !fromGesture) continue;
      void element.play().catch(() => {
        if (track.kind === Track.Kind.Video) setRemoteStuck(true);
      });
    }
  };
  useEffect(() => {
    if (!room) return undefined;
    const map = attached.current;
    const wanted = new Map<Track, { host: HTMLDivElement; local: boolean }>();
    for (const { track, local } of tracks) {
      // Hádžem: zobrazíme len SÚPEROVU kameru – moju lokálnu skryjeme.
      if (!large && local) continue;
      const host = local ? localHost.current : remoteHost.current;
      if (!track || !host || track.isMuted) continue;
      wanted.set(track, { host, local });
    }
    for (const [track, { element, host }] of map) {
      const want = wanted.get(track);
      if (!want || want.host !== host) {
        removeElement(track, element);
        map.delete(track);
      }
    }
    for (const [track, { host, local }] of wanted) {
      let entry = map.get(track);
      if (!entry) {
        // autoplay/muted/playsInline nastavuje LiveKit sám (na Safari zámerne bez
        // autoplay — v úspornom režime by video ostalo stáť na pauze).
        const element = track.attach();
        if (local) element.muted = true;
        host.appendChild(element);
        entry = { element, host };
        map.set(track, entry);
        if (element instanceof HTMLVideoElement)
          void element.play().catch(() => {
            if (!local) setRemoteStuck(true);
          });
      }
      if (entry.element instanceof HTMLVideoElement) {
        entry.element.style.width = '100%';
        entry.element.style.height = `${local ? localHeight : remoteHeight}px`;
        entry.element.style.objectFit = 'contain';
        entry.element.style.display = 'block';
      }
    }
    return undefined;
  }, [room, tracks, large, remoteHeight, localHeight]);
  // Pri odchode z hovoru / novej miestnosti uprac všetky prvky.
  useEffect(() => {
    if (!room) return undefined;
    const map = attached.current;
    return () => {
      for (const [track, { element }] of map) removeElement(track, element);
      map.clear();
      setRemoteStuck(false);
    };
  }, [room]);
  // Strážca: súperova stopa je, ale obraz nebeží (pauza / žiadne snímky) → tlačidlo.
  useEffect(() => {
    if (!room) return undefined;
    let misses = 0;
    const id = setInterval(() => {
      let remoteVideo: HTMLVideoElement | undefined;
      for (const [track, { element }] of attached.current)
        if (
          track.kind === Track.Kind.Video &&
          element instanceof HTMLVideoElement &&
          element.parentElement === remoteHost.current
        )
          remoteVideo = element;
      if (!remoteVideo) {
        // Súper kameru vysiela, ale odber sa nerozbehol → požiadame oň znova.
        const pub = [...room.remoteParticipants.values()]
          .map((p) => p.getTrackPublication(Track.Source.Camera))
          .find((p) => p instanceof RemoteTrackPublication && !p.isMuted && !p.isSubscribed);
        if (pub instanceof RemoteTrackPublication) {
          misses += 1;
          if (misses === 2 || misses % 5 === 0) {
            pub.setSubscribed(false);
            setTimeout(() => pub.setSubscribed(true), 400);
          }
          if (misses >= 3) setRemoteStuck(true);
          return;
        }
        misses = 0;
        setRemoteStuck(false);
        return;
      }
      const ok = !remoteVideo.paused && remoteVideo.videoWidth > 0;
      if (ok) {
        misses = 0;
        setRemoteStuck(false);
        return;
      }
      if (remoteVideo.paused) void remoteVideo.play().catch(() => undefined);
      misses += 1;
      if (misses >= 2) setRemoteStuck(true);
    }, 2000);
    return () => clearInterval(id);
  }, [room]);
  const restartRemoteVideo = () => {
    // Ťuknutie = gesto → iOS dovolí spustiť prehrávanie. Navyše obnovíme odber.
    playAll(true);
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      const pub = p.getTrackPublication(Track.Source.Camera);
      if (pub instanceof RemoteTrackPublication && !pub.isMuted) {
        pub.setSubscribed(false);
        setTimeout(() => pub.setSubscribed(true), 400);
      }
    }
    setRemoteStuck(false);
    feedback.selection();
  };
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
      setTracks(
        snapshotTracks(room).filter(({ track }) => !audioOnly || track?.kind === Track.Kind.Audio),
      );
      feedback.selection();
    } catch (e) {
      camErrors.current.push(
        e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 80) : String(e),
      );
      setError(
        isCameraBusy(e)
          ? 'Kameru drží iná aplikácia alebo karta. Zavri ju a skús kameru zapnúť znova.'
          : e instanceof Error
            ? e.message
            : 'Kamera alebo mikrofón nie sú dostupné.',
      );
      feedback.error();
    } finally {
      setPending(false);
    }
  };
  if (!room)
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
    <View className="bg-surface rounded-xl p-3">
      {audioOnly ? (
        <View className="items-center gap-3 py-5">
          <Phone size={32} strokeWidth={1.8} color={palette.ink} />
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
            {peerName ? `@${peerName}` : 'Hlasový hovor'}
          </Txt>
          <Txt className="text-muted text-[13px]">
            {room.remoteParticipants.size ? 'Hovor prebieha' : 'Čakám na priateľa…'}
          </Txt>
          <div ref={remoteHost} style={{ display: 'none' }} />
        </View>
      ) : (
        <>
          {!!peerInfo && (
            <Txt className="text-muted mb-2 text-[12px]" numberOfLines={1}>
              {peerInfo}
            </Txt>
          )}
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
              {remoteStuck && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  accessibilityLabel="Spustiť obraz súpera"
                  onPress={restartRemoteVideo}
                >
                  <Button.Label>Nevidíš obraz? Ťukni sem</Button.Label>
                </Button>
              )}
            </View>
            {large && (
              <View>
                <Txt className="mb-1 text-[12px]">Tvoja kamera</Txt>
                <div style={{ position: 'relative' }}>
                  <div
                    ref={localHost}
                    style={{
                      minHeight: localHeight,
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
        </>
      )}
      {audioBlocked && (
        <Button
          variant="secondary"
          isDisabled={pending}
          onPress={() =>
            void control(async () => {
              await room.startAudio();
              setAudioBlocked(!room.canPlaybackAudio);
            })
          }
        >
          <Button.Label>Zapnúť zvuk hovoru</Button.Label>
        </Button>
      )}
      {!!error && (
        <Txt className="text-danger mt-2 text-[12px]" accessibilityRole="alert">
          {error}
        </Txt>
      )}
      {!!diag && !audioOnly && (
        <Txt className="text-muted mt-2 text-[10px]" selectable>
          {diag}
        </Txt>
      )}
      <VideoControls
        audioOnly={audioOnly}
        camera={camera}
        microphone={microphone}
        pending={pending}
        onCamera={() =>
          void control(() =>
            withCameraRetry(() =>
              room.localParticipant.setCameraEnabled(!camera, {
                resolution: VIDEO_PRESETS[videoTier.current].resolution,
                ...trackOptions(facing, deviceId),
              }),
            ),
          )
        }
        onMicrophone={() =>
          void control(async () => {
            const next = !microphone;
            await room.localParticipant.setMicrophoneEnabled(next);
            micRef.current = next;
            setMicrophone(next);
            onMicChange?.(next);
          })
        }
        onFlip={() =>
          void control(async () => {
            const next = facing === 'user' ? 'environment' : 'user';
            if (relayActive.current)
              throw new Error('Pri náhradnom vysielaní kamery sa kamera nedá otočiť.');
            const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
            if (!(track instanceof LocalVideoTrack)) throw new Error('Najprv zapni kameru.');
            // Rozlíšenie drží aktuálne pásmo (auto-kvalita), nie pevných 720p.
            const res = VIDEO_PRESETS[videoTier.current].resolution;
            await withCameraRetry(() =>
              track.restartTrack({
                facingMode: next,
                resolution: { width: res.width, height: res.height, frameRate: 30 },
              }),
            );
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

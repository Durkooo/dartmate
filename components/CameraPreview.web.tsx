import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { LocalVideoTrack } from 'livekit-client';
import { Txt } from '@/components/DartsUI';
import { createPreferredTrack, listCameras, type CameraDevice, type Facing } from '@/lib/video';

/** Živý náhľad kamery (web) — na výber prednej/zadnej. */
export function CameraPreview({
  facing,
  deviceId,
  onDevices,
}: {
  facing: Facing;
  deviceId?: string;
  onDevices?: (devices: CameraDevice[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let track: LocalVideoTrack | null = null;
    setReady(false);
    setError('');
    void createPreferredTrack(facing, deviceId)
      .then((t) => {
        if (!active) {
          t.stop();
          return;
        }
        track = t;
        const el = videoRef.current;
        if (el) {
          t.attach(el);
          setReady(true);
        }
        if (onDevices) void listCameras().then((d) => active && onDevices(d));
      })
      .catch(() => {
        if (active) setError('Kameru sa nepodarilo zapnúť. Skontroluj povolenie prehliadača.');
      });
    return () => {
      active = false;
      track?.stop();
      track = null;
    };
  }, [facing, deviceId]);
  if (error) return <Txt className="text-danger text-[13px]">{error}</Txt>;
  return (
    <View className="overflow-hidden rounded-xl">
      {!ready && (
        <View className="bg-surface h-[220px] items-center justify-center">
          <Txt className="text-muted text-[13px]">Zapínam kameru…</Txt>
        </View>
      )}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ height: 220, width: '100%', objectFit: 'cover', display: ready ? 'block' : 'none' }}
      />
    </View>
  );
}

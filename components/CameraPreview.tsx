import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { VideoTrack } from '@livekit/react-native';
import type { LocalVideoTrack } from 'livekit-client';
import { Txt } from '@/components/DartsUI';
import { createPreferredTrack, listCameras, type CameraDevice, type Facing } from '@/lib/video';

/** Živý náhľad kamery (mobil) — na výber prednej/zadnej. */
export function CameraPreview({
  facing,
  deviceId,
  onDevices,
}: {
  facing: Facing;
  deviceId?: string;
  onDevices?: (devices: CameraDevice[]) => void;
}) {
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setTrack(null);
    setError('');
    void createPreferredTrack(facing, deviceId)
      .then((t) => {
        if (!active) {
          t.stop();
          return;
        }
        setTrack(t);
        if (onDevices) void listCameras().then((d) => active && onDevices(d));
      })
      .catch(() => {
        if (active) setError('Kameru sa nepodarilo zapnúť. Skontroluj povolenie.');
      });
    return () => {
      active = false;
      setTrack((t) => {
        t?.stop();
        return null;
      });
    };
  }, [facing, deviceId]);
  if (error) return <Txt className="text-danger text-[13px]">{error}</Txt>;
  if (!track)
    return (
      <View className="bg-surface h-[220px] items-center justify-center rounded-xl">
        <Txt className="text-muted text-[13px]">Zapínam kameru…</Txt>
      </View>
    );
  return (
    <View className="overflow-hidden rounded-xl">
      <VideoTrack trackRef={track} objectFit="cover" style={{ height: 220, width: '100%' }} />
    </View>
  );
}

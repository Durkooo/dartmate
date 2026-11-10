import { useEffect, useEffectEvent, useState } from 'react';
import { View } from 'react-native';
import type { LocalVideoTrack } from 'livekit-client';
import { Txt } from '@/components/DartsUI';
import {
  createPreferredTrack,
  loadNativeVideo,
  listCameras,
  type CameraDevice,
  type Facing,
} from '@/lib/video';

/** Živý náhľad kamery (mobil) — na výber prednej/zadnej. */
type PreviewProps = {
  facing: Facing;
  deviceId?: string;
  onDevices?: (devices: CameraDevice[]) => void;
};
export function CameraPreview(props: PreviewProps) {
  return <PreviewSession key={JSON.stringify([props.facing, props.deviceId])} {...props} />;
}
function PreviewSession({ facing, deviceId, onDevices }: PreviewProps) {
  const [native, setNative] = useState<Awaited<ReturnType<typeof loadNativeVideo>> | null>(null);
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);
  const [error, setError] = useState('');
  const reportDevices = useEffectEvent((devices: CameraDevice[]) => onDevices?.(devices));
  useEffect(() => {
    let active = true;
    let captured: LocalVideoTrack | null = null;
    void (async () => {
      try {
        const module = await loadNativeVideo();
        if (!active) return;
        setNative(module);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Video nie je dostupné.');
        return;
      }
      try {
        const t = await createPreferredTrack(facing, deviceId);
        if (!active) {
          t.stop();
          return;
        }
        captured = t;
        setTrack(t);
        void listCameras().then((devices) => {
          if (active) reportDevices(devices);
        });
      } catch {
        if (active) setError('Kameru sa nepodarilo zapnúť. Skontroluj povolenie.');
      }
    })();
    return () => {
      active = false;
      captured?.stop();
    };
  }, [facing, deviceId]);
  if (error) return <Txt className="text-danger text-[13px]">{error}</Txt>;
  if (!track || !native)
    return (
      <View className="bg-surface h-[220px] items-center justify-center rounded-xl">
        <Txt className="text-muted text-[13px]">Zapínam kameru…</Txt>
      </View>
    );
  return (
    <View className="overflow-hidden rounded-xl">
      <native.VideoView
        videoTrack={track}
        objectFit="cover"
        style={{ height: 220, width: '100%' }}
      />
    </View>
  );
}

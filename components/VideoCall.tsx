import { useEffect, useState, type ComponentType } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { VideoNotice } from '@/components/VideoUI';
import { feedback } from '@/lib/darts';
import type { VideoCredentials } from '@/lib/video';
export type VideoCallProps = {
  matchId: string;
  onLeave: () => void;
  large?: boolean;
  micWanted?: boolean;
  onMicChange?: (on: boolean) => void;
  /** Vlastné načítanie credentials (chat-hovor); predvolene token k matchId. */
  getCredentials?: () => Promise<VideoCredentials>;
};

const expoGoError =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? 'Video nie je podporované v Expo Go. Otvor nainštalovanú aplikáciu; tu môžeš hrať bez kamery.'
    : '';

export default function VideoCall(props: VideoCallProps) {
  const [Native, setNative] = useState<ComponentType<VideoCallProps> | null>(null);
  const [error, setError] = useState(expoGoError);
  const [request, setRequest] = useState(() => ({
    load: () => import('@/components/NativeVideoCall'),
  }));
  const [previousRequest, setPreviousRequest] = useState(request);
  if (previousRequest !== request) {
    setPreviousRequest(request);
    setError(expoGoError);
  }
  useEffect(() => {
    let mounted = true;
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      feedback.error();
      return undefined;
    }
    void request
      .load()
      .then((module) => {
        if (mounted) setNative(() => module.default);
      })
      .catch(() => {
        if (!mounted) return;
        setError(
          'V tejto verzii aplikácie chýba podpora videohovorov. Nainštaluj nové zostavenie alebo hraj bez kamery.',
        );
        feedback.error();
      });
    return () => {
      mounted = false;
    };
  }, [request]);
  return Native ? (
    <Native {...props} />
  ) : (
    <VideoNotice
      error={error}
      pending={!error}
      retry={() => setRequest({ load: () => import('@/components/NativeVideoCall') })}
      leave={props.onLeave}
    />
  );
}

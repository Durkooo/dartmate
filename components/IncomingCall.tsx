import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Vibration, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { Phone, Video } from 'lucide-react-native';
import { Heading, Txt } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';
import { bilt } from '@/lib/bilt';
import { usePlayers } from '@/lib/players';
import {
  CALL_PREFIX,
  CALL_WAIT_MS,
  appIsActive,
  callKind,
  type CallKind,
  type DirectMessage,
  loadContacts,
  loadJoinedCalls,
  markCallJoined,
} from '@/lib/online';

type Incoming = { id: number; peerId: string; nickname: string; kind: CallKind; createdAt: number };

/** Foreground call invitation UI. Closed PWAs rely on Web Push, not native call UI. */
export function IncomingCallWatcher() {
  const userId = usePlayers((s) => s.session?.user.id);
  return userId ? <CallWatcher key={userId} userId={userId} /> : null;
}
function CallWatcher({ userId }: { userId: string }) {
  const [ringing, setRinging] = useState<Incoming | null>(null);
  const seen = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = useCallback(async () => {
    if (!appIsActive() || ringing || busy.current) return;
    busy.current = true;
    try {
      const { data, error } = await bilt
        .from('direct_messages')
        .select('id,sender_id,created_at,body')
        .eq('recipient_id', userId)
        .like('body', `${CALL_PREFIX}%`)
        .order('id', { ascending: false })
        .limit(5);
      if (error || !data) return;
      const joined = await loadJoinedCalls();
      const now = Date.now();
      const messages: Pick<DirectMessage, 'id' | 'sender_id' | 'created_at' | 'body'>[] = data;
      const fresh = messages.find((m) => {
        const t = new Date(m.created_at).getTime();
        return (
          !Number.isNaN(t) &&
          now - t <= CALL_WAIT_MS &&
          m.id > seen.current &&
          (joined[m.sender_id] ?? 0) <= t
        );
      });
      if (!fresh) return;
      const contacts = await loadContacts();
      if (!mounted.current || usePlayers.getState().session?.user.id !== userId) return;
      seen.current = fresh.id;
      setRinging({
        id: fresh.id,
        peerId: fresh.sender_id,
        nickname: contacts.find((c) => c.user_id === fresh.sender_id)?.nickname ?? 'Hráč',
        kind: callKind(fresh.body),
        createdAt: new Date(fresh.created_at).getTime(),
      });
    } catch {
      // A transient polling error must not interrupt the current screen.
    } finally {
      busy.current = false;
    }
  }, [userId, ringing]);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), 3500);
    const subscription = AppState.addEventListener('change', () => void check());
    const onVisible = () => void check();
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  useEffect(() => {
    if (!ringing) return undefined;
    let active = true;
    Vibration.vibrate([0, 1000, 400, 1000], true);
    const timer = setInterval(() => {
      if (Date.now() - ringing.createdAt > CALL_WAIT_MS) setRinging(null);
      else
        void loadJoinedCalls().then((joined) => {
          if (active && (joined[ringing.peerId] ?? 0) > ringing.createdAt) setRinging(null);
        });
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [ringing]);

  if (!ringing) return null;
  const CallIcon = ringing.kind === 'audio' ? Phone : Video;
  const decline = () => {
    void markCallJoined(ringing.peerId);
    feedback.selection();
    setRinging(null);
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={decline}>
      <View className="flex-1 items-center justify-center bg-black/70 p-6">
        <View className="bg-surface w-full max-w-[340px] items-center gap-3 rounded-3xl p-6">
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 72, height: 72, backgroundColor: palette.success }}
          >
            <CallIcon size={32} color={palette.white} strokeWidth={1.8} />
          </View>
          <Heading className="text-center text-[20px]">@{ringing.nickname}</Heading>
          <Txt className="text-muted text-center text-[14px]">
            {ringing.kind === 'audio' ? 'Prichádzajúci hlasový hovor' : 'Prichádzajúci videohovor'}
          </Txt>
          <View className="mt-2 w-full gap-2">
            <Button
              onPress={() => {
                const target = ringing;
                setRinging(null);
                feedback.success();
                router.push({
                  pathname: '/conversation/[id]',
                  params: { id: target.peerId, autoJoin: String(target.id) },
                });
              }}
            >
              <Button.Label>Prijať</Button.Label>
            </Button>
            <Button variant="secondary" onPress={decline}>
              <Button.Label>Odmietnuť</Button.Label>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

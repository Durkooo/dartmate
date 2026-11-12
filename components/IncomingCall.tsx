import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Vibration, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { Video } from 'lucide-react-native';
import { Heading, Txt } from '@/components/DartsUI';
import { palette } from '@/lib/darts';
import { bilt } from '@/lib/bilt';
import { usePlayers } from '@/lib/players';
import {
  CALL_PREFIX,
  CALL_WAIT_MS,
  loadContacts,
  loadJoinedCalls,
  markCallJoined,
} from '@/lib/online';

type Incoming = { peerId: string; nickname: string };

/**
 * Stráži prichádzajúce videohovory, aj keď nie si v konverzácii.
 * Pri čerstvej pozvánke vibruje a ukáže prehľad „niekto ti volá“
 * s tlačidlami Prijať / Odmietnuť (ako WhatsApp v appke).
 *
 * Skutočné systémové zvonenie pri zatvorenej appke (CallKit / full-screen
 * intent) z JS kódu nejde — to vyžaduje natívny rebuild + VoIP push na
 * serveri. Dovtedy príde pri zatvorenej appke aspoň push notifikácia.
 */
export function IncomingCallWatcher() {
  const userId = usePlayers((s) => s.session?.user.id);
  const [ringing, setRinging] = useState<Incoming | null>(null);
  const seen = useRef(0);

  const check = useCallback(async () => {
    if (!userId || AppState.currentState !== 'active' || ringing) return;
    try {
      const { data, error } = await bilt
        .from('direct_messages')
        .select('id,sender_id,created_at')
        .eq('recipient_id', userId)
        .like('body', `${CALL_PREFIX}%`)
        .order('id', { ascending: false })
        .limit(5);
      if (error || !Array.isArray(data)) return;
      const now = Date.now();
      const fresh = (data as { sender_id: string; created_at: string }[]).find((m) => {
        const t = new Date(m.created_at).getTime();
        return !Number.isNaN(t) && now - t <= CALL_WAIT_MS && t > seen.current;
      });
      if (!fresh) return;
      seen.current = new Date(fresh.created_at).getTime();
      // Už vybavené z konverzácie (pripojené či odmietnuté)? Nezvoň.
      const joined = await loadJoinedCalls().catch(() => ({} as Record<string, number>));
      if ((joined[fresh.sender_id] ?? 0) > seen.current) return;
      const contacts = await loadContacts().catch(() => []);
      const contact = contacts.find((c) => c.user_id === fresh.sender_id);
      setRinging({
        peerId: fresh.sender_id,
        nickname: contact?.nickname ?? 'Neznámy hráč',
      });
    } catch {
      // Strážca nesmie zhodiť appku — chyba sa len preskočí.
    }
  }, [userId, ringing]);

  useEffect(() => {
    if (!userId) return undefined;
    void check();
    const id = setInterval(() => void check(), 10000);
    return () => clearInterval(id);
  }, [userId, check]);

  // Vyzváňanie: opakovaná vibrácia, kým prehľad svieti.
  useEffect(() => {
    if (!ringing) return undefined;
    Vibration.vibrate([0, 1000, 400, 1000], true);
    return () => Vibration.cancel();
  }, [ringing]);

  if (!ringing) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={() => setRinging(null)}>
      <View className="flex-1 items-center justify-center bg-black/70 p-6">
        <View className="bg-surface w-full max-w-[340px] items-center gap-3 rounded-3xl p-6">
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 72, height: 72, backgroundColor: palette.success }}
          >
            <Video size={32} color="#fff" strokeWidth={2} />
          </View>
          <Heading className="text-center text-[20px]">@{ringing.nickname}</Heading>
          <Txt className="text-muted text-center text-[14px]">Prichádzajúci videohovor…</Txt>
          <View className="mt-2 w-full gap-2">
            <Button
              onPress={() => {
                const target = ringing;
                setRinging(null);
                router.push({
                  pathname: '/conversation/[id]',
                  params: { id: target.peerId, autoJoin: '1' },
                });
              }}
            >
              <Button.Label>Prijať</Button.Label>
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                void markCallJoined(ringing.peerId);
                setRinging(null);
              }}
            >
              <Button.Label>Odmietnuť</Button.Label>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

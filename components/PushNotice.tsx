import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from 'heroui-native';
import { BellRing } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { palette } from '@/lib/darts';
import { usePlayers } from '@/lib/players';
import {
  ensurePushSubscription,
  pushPermission,
  pushSupported,
  requestPushPermission,
  wasPushAsked,
} from '@/lib/push';

/**
 * Jednorazová výzva na povolenie notifikácií o nových správach.
 * Zobrazí sa prihlásenému používateľovi v sekcii Priatelia, len na webe
 * s podporou Web Push a len kým povolenie neudelí/nezamietne.
 */
export function PushNotice() {
  const userId = usePlayers((s) => s.session?.user.id);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!userId || !pushSupported()) return;
      if (pushPermission() !== 'default') return;
      if (await wasPushAsked()) return;
      // Ak už subscription existuje (napr. z iného zariadenia), nepýtaj sa.
      const res = await ensurePushSubscription(userId);
      if (active) setVisible(res !== 'ok');
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const ask = useCallback(async () => {
    if (!userId || pending) return;
    setPending(true);
    setFailed(false);
    const res = await requestPushPermission(userId);
    setPending(false);
    if (res === 'ok' || res === 'denied' || res === 'skipped') setVisible(false);
    else setFailed(true);
  }, [userId, pending]);

  if (!visible) return null;
  return (
    <View className="bg-surface mb-4 gap-2 rounded-xl p-4">
      <View className="flex-row items-center gap-2">
        <BellRing size={18} color={palette.ink} strokeWidth={1.8} />
        <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Upozorniť na nové správy</Txt>
      </View>
      <Txt className="text-muted text-[13px] leading-5">
        Keď ti priateľ napíše, vyskočí ti systémové upozornenie – aj keď máš appku zavretú.
        Na iPhone funguje len ak máš appku pridanú na plochu.
      </Txt>
      {failed && (
        <Txt className="text-danger text-[13px]">
          Povolenie sa nepodarilo uložiť. Skús to znova.
        </Txt>
      )}
      <Button variant="secondary" isDisabled={pending} onPress={() => void ask()}>
        <Button.Label>{pending ? 'Čakaj…' : 'Zapnúť upozornenia'}</Button.Label>
      </Button>
    </View>
  );
}

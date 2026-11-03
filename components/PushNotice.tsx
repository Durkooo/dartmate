import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from 'heroui-native';
import { BellRing, BellOff } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { palette } from '@/lib/darts';
import { usePlayers } from '@/lib/players';
import {
  disablePushSubscription,
  ensurePushSubscription,
  needsAndroidChrome,
  needsIosInstall,
  pushHintLine,
  pushPermission,
  pushSupported,
  requestPushPermission,
  wasPushAsked,
} from '@/lib/push';

type Status = 'loading' | 'prompt' | 'on' | 'denied' | 'unsupported' | 'ios-install' | 'android-chrome';

/**
 * Ovládanie upozornení na nové správy v sekcii Priatelia.
 * - Výzva na zapnutie (kým povolenie neudelí/nezamietne).
 * - Stav „Zapnuté“ s možnosťou vypnúť.
 * - Návod pri zamietnutí a pre iPhone bez nainštalovanej appky.
 */
export function PushNotice() {
  const userId = usePlayers((s) => s.session?.user.id);
  const [status, setStatus] = useState<Status>('loading');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatus('loading');
      return;
    }
    if (needsIosInstall()) {
      setStatus('ios-install');
      return;
    }
    if (needsAndroidChrome()) {
      setStatus('android-chrome');
      return;
    }
    if (!pushSupported()) {
      setStatus('unsupported');
      return;
    }
    const perm = pushPermission();
    if (perm === 'denied') {
      setStatus('denied');
      return;
    }
    if (perm === 'granted') {
      const res = await ensurePushSubscription(userId);
      setStatus(res === 'ok' ? 'on' : 'prompt');
      return;
    }
    if (await wasPushAsked()) {
      setStatus('prompt');
      return;
    }
    const res = await ensurePushSubscription(userId);
    setStatus(res === 'ok' ? 'on' : 'prompt');
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const ask = useCallback(async () => {
    if (!userId || pending) return;
    setPending(true);
    setFailed(false);
    const res = await requestPushPermission(userId);
    setPending(false);
    if (res === 'ok') setStatus('on');
    else if (res === 'denied') setStatus('denied');
    else setFailed(true);
  }, [userId, pending]);

  const turnOff = useCallback(async () => {
    if (!userId || pending) return;
    setPending(true);
    setFailed(false);
    const res = await disablePushSubscription(userId);
    setPending(false);
    if (res === 'ok') setStatus('prompt');
    else setFailed(true);
  }, [userId, pending]);

  if (!userId || status === 'loading' || status === 'unsupported') return null;

  if (status === 'ios-install') {
    return (
      <View className="bg-surface mb-4 gap-2 rounded-xl p-4">
        <View className="flex-row items-center gap-2">
          <BellRing size={18} color={palette.ink} strokeWidth={1.8} />
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Upozornenia na iPhone</Txt>
        </View>
        <Txt className="text-muted text-[13px] leading-5">
          Apple dovolí upozornenia len appke pridanej na plochu: v Safari klepni na Zdieľať →
          „Pridať na plochu“ a otvor DartMate odtiaľ. Potom tu zapneš upozornenia.
        </Txt>
      </View>
    );
  }

  if (status === 'android-chrome') {
    return (
      <View className="bg-surface mb-4 gap-2 rounded-xl p-4">
        <View className="flex-row items-center gap-2">
          <BellRing size={18} color={palette.ink} strokeWidth={1.8} />
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Upozornenia na Androide</Txt>
        </View>
        <Txt className="text-muted text-[13px] leading-5">
          Tento prehliadač upozornenia nevie. Otvor DartMate v prehliadači Chrome (najlepšie s
          appkou pridanou na plochu) a zapni ich tam.
        </Txt>
      </View>
    );
  }

  if (status === 'denied') {
    return (
      <View className="bg-surface mb-4 gap-2 rounded-xl p-4">
        <View className="flex-row items-center gap-2">
          <BellOff size={18} color={palette.ink} strokeWidth={1.8} />
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Upozornenia sú vypnuté</Txt>
        </View>
        <Txt className="text-muted text-[13px] leading-5">
          V prehliadači si ich raz zamietol. Zapneš ich v adresnom riadku (ikonka zámku → Upozornenia
          → Povoliť) a potom sa vráť sem.
        </Txt>
        <Button variant="secondary" isDisabled={pending} onPress={() => void refresh()}>
          <Button.Label>Skúsiť znova</Button.Label>
        </Button>
      </View>
    );
  }

  if (status === 'on') {
    return (
      <View className="bg-surface mb-4 gap-2 rounded-xl p-4">
        <View className="flex-row items-center gap-2">
          <BellRing size={18} color={palette.ink} strokeWidth={1.8} />
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Upozornenia zapnuté</Txt>
        </View>
        <Txt className="text-muted text-[13px] leading-5">
          Keď ti priateľ napíše, vyskočí ti systémové upozornenie – aj keď máš appku zavretú.
        </Txt>
        {failed && (
          <Txt className="text-danger text-[13px]">Vypnutie sa nepodarilo. Skús to znova.</Txt>
        )}
        <Button variant="ghost" isDisabled={pending} onPress={() => void turnOff()}>
          <Button.Label>{pending ? 'Čakaj…' : 'Vypnúť upozornenia'}</Button.Label>
        </Button>
      </View>
    );
  }

  return (
    <View className="bg-surface mb-4 gap-2 rounded-xl p-4">
      <View className="flex-row items-center gap-2">
        <BellRing size={18} color={palette.ink} strokeWidth={1.8} />
        <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Upozorniť na nové správy</Txt>
      </View>
      <Txt className="text-muted text-[13px] leading-5">
        Keď ti priateľ napíše, vyskočí ti systémové upozornenie – aj keď máš appku zavretú.
        {pushHintLine()}
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

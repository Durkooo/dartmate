import { useCallback, useState } from 'react';
import { View, FlatList } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, PressableFeedback, Switch } from 'heroui-native';
import { Check } from 'lucide-react-native';
import { Heading, Txt, Empty, LoadingRows } from '@/components/DartsUI';
import { OnlineGate, OnlineError, Presence } from '@/components/OnlineUI';
import { feedback, palette } from '@/lib/darts';
import { notifyRecipient } from '@/lib/sendPush';
import { playerError, usePlayers } from '@/lib/players';
import { inviteMatch, loadContacts, useOnlineQuery } from '@/lib/online';

export default function NewOnlineMatch() {
  const { friendId } = useLocalSearchParams<{ friendId?: string }>();
  const userId = usePlayers((s) => s.session?.user.id);
  const profile = usePlayers((s) => s.profile);
  const query = useOnlineQuery(
    userId ? `invite:${userId}` : null,
    useCallback(() => loadContacts(), []),
  );
  const [selected, setSelected] = useState(friendId ?? '');
  const [starting, setStarting] = useState(501);
  const [doubleOut, setDoubleOut] = useState(true);
  const [legsToWin, setLegsToWin] = useState(2);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();
  const invite = async () => {
    if (pending || !selected) return;
    setPending(true);
    setError('');
    try {
      const match = await inviteMatch(selected, starting, doubleOut, legsToWin);
      if (usePlayers.getState().session?.user.id !== userId) return;
      feedback.success();
      // Aj pozvánka chodí ako push notifikácia (klik otvorí chat s kartou pozvánky).
      if (profile?.nickname)
        notifyRecipient(
          selected,
          `@${profile.nickname}`,
          `Pozýva ťa na zápas ${starting}${legsToWin > 1 ? ` na ${legsToWin} víťazné legy` : ''}`,
          `/conversation/${userId}`,
        );
      router.replace({ pathname: '/online/[id]', params: { id: match.id } });
    } catch (e) {
      setError(
        playerError({
          message: e instanceof Error ? e.message : 'Pozvánku sa nepodarilo odoslať.',
        }),
      );
      feedback.error();
    } finally {
      setPending(false);
    }
  };
  return (
    <View className="bg-background flex-1">
      <View className="w-full max-w-xl flex-1 self-center">
        <OnlineGate>
          <FlatList
            data={query.loading ? [] : (query.data ?? [])}
            keyExtractor={(c) => c.user_id ?? ''}
            contentContainerStyle={{ padding: 20, paddingBottom: 24, flexGrow: 1 }}
            ListHeaderComponent={
              <View>
                <Heading className="mb-4">Hra</Heading>
                <View className="flex-row gap-3">
                  {[301, 501].map((n) => (
                    <Button
                      key={n}
                      className="flex-1"
                      variant={starting === n ? 'primary' : 'secondary'}
                      isDisabled={pending}
                      onPress={() => {
                        if (starting !== n) {
                          setStarting(n);
                          feedback.selection();
                        }
                      }}
                    >
                      <Button.Label>{n}</Button.Label>
                    </Button>
                  ))}
                </View>
                <View className="mt-5 flex-row items-center justify-between gap-3">
                  <Txt className="flex-1">Ukončenie double out</Txt>
                  <Switch
                    isSelected={doubleOut}
                    isDisabled={pending}
                    onSelectedChange={(v) => {
                      setDoubleOut(v);
                      feedback.selection();
                    }}
                  />
                </View>
                <Txt className="text-muted mt-5 text-[13px] leading-5">
                  Kamera je voliteľná. Zapneš ju až v prijatom zápase.
                </Txt>
                <Heading className="mt-8 mb-3 text-[20px]">Na koľko víťazných legov?</Heading>
                <View className="flex-row gap-3">
                  {([1, 2, 3, 5] as const).map((n) => (
                    <Button
                      key={n}
                      className="flex-1"
                      variant={legsToWin === n ? 'primary' : 'secondary'}
                      isDisabled={pending}
                      onPress={() => {
                        if (legsToWin !== n) {
                          setLegsToWin(n);
                          feedback.selection();
                        }
                      }}
                    >
                      <Button.Label>{n}</Button.Label>
                    </Button>
                  ))}
                </View>
                <Txt className="text-muted mt-3 text-[13px] leading-5">
                  {legsToWin === 1
                    ? 'Jeden leg — kto prvý ukončí hru, vyhráva zápas.'
                    : `Zápas končí, keď niekto vyhrá ${legsToWin} ${legsToWin === 5 ? 'legov' : 'legy'}. Jeden leg = jedna hra ${starting}.`}
                </Txt>
                <Heading className="mt-8 mb-3 text-[20px]">Koho vyzveš?</Heading>
                <OnlineError error={query.error} retry={() => void query.refresh()} />
              </View>
            }
            renderItem={({ item }) => (
              <PressableFeedback
                isDisabled={pending}
                onPress={() => {
                  if (selected !== item.user_id) {
                    setSelected(item.user_id ?? '');
                    feedback.selection();
                  }
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: selected === item.user_id }}
                className="border-border flex-row items-center gap-3 border-b py-4"
              >
                <View className="flex-1 gap-2">
                  <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
                    @{item.nickname}
                  </Txt>
                  <Presence online={!!item.online} unknown={!!query.error} />
                </View>
                {selected === item.user_id && (
                  <Check size={21} strokeWidth={1.8} color={palette.ink} />
                )}
              </PressableFeedback>
            )}
            ListEmptyComponent={
              query.loading ? (
                <LoadingRows />
              ) : !query.error ? (
                <Empty
                  text="Pridaj si priateľa podľa jeho nicku."
                  action="Pridať priateľa"
                  onPress={() => router.push('/friend/new')}
                />
              ) : undefined
            }
          />
          <View
            className="bg-surface border-border border-t px-5 pt-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            {!!error && (
              <Txt className="text-danger mb-3" accessibilityRole="alert">
                {error}
              </Txt>
            )}
            <Button
              isDisabled={
                pending ||
                !selected ||
                !!query.error ||
                !query.data?.some((c: any) => c.user_id === selected)
              }
              onPress={() => void invite()}
            >
              <Button.Label>{pending ? 'Odosielam…' : 'Poslať pozvánku'}</Button.Label>
            </Button>
            <Button variant="ghost" className="mt-1" onPress={() => router.dismissTo('/online')}>
              <Button.Label>Späť na online zápasy</Button.Label>
            </Button>
          </View>
        </OnlineGate>
        {(!userId || !profile) && (
          <Button variant="ghost" className="mx-5 mt-1" onPress={() => router.dismissTo('/online')}>
            <Button.Label>Späť na online zápasy</Button.Label>
          </Button>
        )}
      </View>
    </View>
  );
}

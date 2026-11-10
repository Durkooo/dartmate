import { useCallback, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input, PressableFeedback } from 'heroui-native';
import { UserPlus, ChevronRight } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  Heading,
  Txt,
  FriendRow,
  Avatar,
  Empty,
  LoadingRows,
  StorageNotice,
} from '@/components/DartsUI';
import { palette, useDarts } from '@/lib/darts';
import { usePlayers } from '@/lib/players';
import { loadContacts, loadStatistics, useOnlineQuery } from '@/lib/online';
import { OnlineError, Presence } from '@/components/OnlineUI';
import { PushNotice } from '@/components/PushNotice';

export default function Friends() {
  const [query, setQuery] = useState('');
  const localFriends = useDarts((s) => s.friends);
  const hydrated = useDarts((s) => s.hydrated);
  const session = usePlayers((s) => s.session);
  const profile = usePlayers((s) => s.profile);
  const onlineFriends = usePlayers((s) => s.friends);
  const ready = usePlayers((s) => s.ready);
  const loading = usePlayers((s) => s.loading);
  const error = usePlayers((s) => s.error);
  const refresh = usePlayers((s) => s.refresh);
  const social = useOnlineQuery(
    session ? `friends:${session.user.id}` : null,
    useCallback(() => loadContacts(), []),
  );
  const stats = useOnlineQuery(
    session ? `stats:${session.user.id}` : null,
    useCallback(() => loadStatistics().catch(() => null), []),
    15000,
  );
  const avg =
    typeof stats.data?.three_dart_average === 'number' ? stats.data.three_dart_average : null;
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const friends = session ? onlineFriends : localFriends;
  const history = useDarts((s) => s.history);
  // Offline priemer priateľa: hody súpera (hráč 1) z lokálnych zápasov s rovnakým menom.
  const offlineAvg = useCallback(
    (handle: string, name: string) => {
      const norm = (s: string) => s.trim().toLocaleLowerCase('sk');
      const keys = [norm(handle), norm(name)].filter(Boolean);
      let score = 0;
      let darts = 0;
      for (const g of history) {
        if (g.solo || !keys.includes(norm(g.opponentName ?? ''))) continue;
        for (const t of g.turns ?? []) {
          if (t.player !== 1) continue;
          const d = typeof t.darts === 'number' && t.darts > 0 ? t.darts : 3;
          score += t.score;
          darts += d;
        }
      }
      return darts > 0 ? (score / darts) * 3 : null;
    },
    [history],
  );
  const insets = useSafeAreaInsets();
  const busy = !ready || (!session && !hydrated) || loading;
  const shown = friends.filter((f) =>
    `${f.name} ${f.handle}`.toLocaleLowerCase('sk').includes(query.trim().toLocaleLowerCase('sk')),
  );
  return (
    <KeyboardAvoidingView
      className="bg-background flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ paddingTop: insets.top }}
    >
      <FlatList
        data={busy || error ? [] : shown}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 32,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View className="mb-6 flex-row items-center justify-between">
              <View className="flex-1 flex-row items-baseline gap-2">
                <Heading>Priatelia</Heading>
                {profile ? (
                  <Txt
                    numberOfLines={1}
                    className="text-[24px] leading-8"
                    style={{ fontFamily: 'Inter_700Bold', color: palette.onInk }}
                  >
                    @{profile.nickname}
                  </Txt>
                ) : null}
                {avg !== null ? (
                  <Txt
                    numberOfLines={1}
                    className="text-[15px]"
                    style={{ fontFamily: 'Inter_600SemiBold', color: palette.onInk }}
                  >
                    avg. {Math.round(avg)}
                  </Txt>
                ) : null}
              </View>
              <Button
                variant="secondary"
                isIconOnly
                accessibilityLabel="Pridať priateľa"
                onPress={() => router.push('/friend/new')}
              >
                <UserPlus size={21} color={palette.ink} strokeWidth={1.8} />
              </Button>
            </View>
            <StorageNotice />
            {session ? <PushNotice /> : null}
            {!profile && (
              <View className="mb-6 gap-3">
                <Txt>
                  {session
                    ? 'Nastav si nick, aby ťa priatelia našli.'
                    : 'Nájdi priateľov, ktorí majú túto aplikáciu.'}
                </Txt>
                <Button onPress={() => router.push('/account')}>
                  <Button.Label>
                    {session ? 'Vybrať nick' : 'Prihlásiť sa a vybrať nick'}
                  </Button.Label>
                </Button>
              </View>
            )}
            <OnlineError error={social.error} retry={() => void social.refresh()} />
            {session && (
              <Button className="mb-4" variant="secondary" onPress={() => router.push('/online')}>
                <Button.Label>Pozvánky a zápasy</Button.Label>
              </Button>
            )}
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Hľadať v mojich priateľoch"
              accessibilityLabel="Hľadať v mojich priateľoch"
              className="rounded-xl"
            />
            <View className="mt-7 mb-1 flex-row justify-between gap-2">
              <Txt className="text-muted text-[13px]">
                {session ? 'Tvoja partia' : 'Ukážková partia'}
              </Txt>
              {!busy && (
                <Txt className="text-muted text-[13px]">
                  {shown.length}{' '}
                  {shown.length === 1
                    ? 'priateľ'
                    : shown.length < 5 && shown.length > 1
                      ? 'priatelia'
                      : 'priateľov'}
                </Txt>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const contact = session
            ? social.data?.find((c: any) => c.user_id === item.id)
            : undefined;
          const onlineAvg = typeof contact?.avg === 'number' ? contact.avg : null;
          const offAvg = session ? offlineAvg(item.handle ?? '', item.name ?? '') : null;
          const combined =
            onlineAvg !== null && offAvg !== null
              ? Math.round((onlineAvg + offAvg) / 2)
              : onlineAvg !== null
                ? Math.round(onlineAvg)
                : offAvg !== null
                  ? Math.round(offAvg)
                  : null;
          return (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            {session ? (
              <PressableFeedback
                onPress={() => router.push({ pathname: '/friend/[id]', params: { id: item.id } })}
                className="flex-row items-center gap-3 py-3"
              >
                <Avatar friend={item} />
                <View className="flex-1">
                  <View className="flex-row items-baseline gap-2">
                    <Txt
                      numberOfLines={1}
                      className="flex-1"
                      style={{ fontFamily: 'Inter_600SemiBold' }}
                    >
                      @{item.handle}
                    </Txt>
                    {combined !== null ? (
                      <Txt
                        numberOfLines={1}
                        className="text-[13px]"
                        style={{ fontFamily: 'Inter_600SemiBold', color: palette.onInk }}
                      >
                        avg. {combined}
                      </Txt>
                    ) : null}
                  </View>
                  <View className="mt-2">
                    <Presence
                      online={!!contact?.online}
                      playing={!!contact?.in_match}
                      unknown={social.loading || !!social.error}
                    />
                  </View>
                </View>
                <ChevronRight size={20} color={palette.muted} strokeWidth={1.8} />
              </PressableFeedback>
            ) : (
              <FriendRow
                friend={item}
                detail={
                  item.demo ? `@${item.handle} · ukážkový hráč` : `@${item.handle} · lokálny hráč`
                }
              />
            )}
          </Animated.View>
          );
        }}
        ListEmptyComponent={
          busy ? (
            <LoadingRows />
          ) : error ? (
            <View className="gap-4 py-6">
              <Txt className="text-danger" accessibilityRole="alert">
                {error}
              </Txt>
              <Button variant="outline" onPress={() => void refresh()}>
                <Button.Label>Skúsiť znova</Button.Label>
              </Button>
            </View>
          ) : (
            <Empty
              text={
                query
                  ? 'Takého priateľa tu zatiaľ nemáš.'
                  : 'Tu budú hráči, ktorých pridáš podľa nicku.'
              }
              action={query ? 'Vymazať hľadanie' : 'Pridať priateľa'}
              onPress={() => (query ? setQuery('') : router.push('/friend/new'))}
            />
          )
        }
      />
    </KeyboardAvoidingView>
  );
}

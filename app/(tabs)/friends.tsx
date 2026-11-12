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
import { palette, useDarts, feedback, type Friend } from '@/lib/darts';
import { bilt } from '@/lib/bilt';
import { usePlayers } from '@/lib/players';
import { announceFriendAdd, loadContacts, loadStatistics, useOnlineQuery, type SocialContact } from '@/lib/online';
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
  const [addingId, setAddingId] = useState<string | null>(null);
  // Ľudia, s ktorými hráva/žne píše, ale nemá ich pridaných (napr. pridali si jeho).
  // Samostatná sekcia — zoznam priateľov sa s nikým nezlučuje.
  const suggestions: (SocialContact & { user_id: string })[] =
    session && social.data
      ? social.data.filter(
          (c): c is SocialContact & { user_id: string } =>
            !!c.user_id &&
            c.user_id !== session.user.id &&
            !onlineFriends.some((f) => f.id === c.user_id),
        )
      : [];
  const q = query.trim().toLocaleLowerCase('sk');
  const shownSuggestions = suggestions.filter((c) =>
    (c.nickname ?? '').toLocaleLowerCase('sk').includes(q),
  );
  const addSuggested = (userId: string) => {
    if (!session || addingId) return;
    setAddingId(userId);
    void (async () => {
      try {
        const { error: e } = await bilt
          .from('player_friends')
          .insert({ owner_id: session.user.id, friend_id: userId });
        if (e) {
          feedback.error();
          return;
        }
        feedback.success();
        // Druhému príde správa + push, aby si ťa mohol pridať späť.
        if (profile?.nickname) {
          void announceFriendAdd(userId, session.user.id, profile.nickname);
        }
        await refresh();
      } finally {
        setAddingId(null);
      }
    })();
  };
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
                        lastSeen={contact?.last_seen ?? null}
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
        ListFooterComponent={
          session && !busy && !error && shownSuggestions.length ? (
            <View className="mt-6 gap-1">
              <Txt className="text-muted mb-2 text-[13px]">
                Hrávaš s nimi, ale nemáš ich pridaných
              </Txt>
              {shownSuggestions.map((c) => {
                const person: Friend = {
                  id: c.user_id,
                  name: c.nickname ?? '?',
                  handle: c.nickname ?? '?',
                  color: 'blue',
                  demo: false,
                };
                return (
                  <View key={c.user_id} className="flex-row items-center gap-3 py-3">
                    <Avatar friend={person} />
                    <View className="flex-1">
                      <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
                        @{c.nickname}
                      </Txt>
                      <View className="mt-2">
                        <Presence
                          online={!!c.online}
                          playing={!!c.in_match}
                          lastSeen={c.last_seen ?? null}
                        />
                      </View>
                    </View>
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={addingId === c.user_id}
                      onPress={() => addSuggested(c.user_id)}
                    >
                      <Button.Label>{addingId === c.user_id ? 'Pridávam…' : 'Pridať'}</Button.Label>
                    </Button>
                  </View>
                );
              })}
            </View>
          ) : undefined
        }
      />
    </KeyboardAvoidingView>
  );
}

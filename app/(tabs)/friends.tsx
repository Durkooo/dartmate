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
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const friends = session ? onlineFriends : localFriends;
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
              <Heading>Priatelia</Heading>
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
            <View className="mb-6 gap-3">
              {profile ? (
                <Button variant="secondary" onPress={() => router.push('/account')}>
                  <Button.Label numberOfLines={1}>Môj nick: @{profile.nickname}</Button.Label>
                </Button>
              ) : (
                <>
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
                </>
              )}
            </View>
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
        renderItem={({ item }) => (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            {session ? (
              <PressableFeedback
                onPress={() => router.push({ pathname: '/friend/[id]', params: { id: item.id } })}
                className="border-border flex-row items-center gap-3 border-b py-4"
              >
                <Avatar friend={item} />
                <View className="flex-1">
                  <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
                    @{item.handle}
                  </Txt>
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
        )}
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
          <Button variant="outline" onPress={() => router.push('/friend/new')} className="mt-6">
            <UserPlus size={19} color={palette.ink} strokeWidth={1.8} />
            <Button.Label>Pridať podľa nicku</Button.Label>
          </Button>
        }
      />
    </KeyboardAvoidingView>
  );
}

import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, PressableFeedback } from 'heroui-native';
import { router, useFocusEffect } from 'expo-router';
import { Heading, Txt, Avatar, Empty, LoadingRows } from '@/components/DartsUI';
import { useDarts } from '@/lib/darts';
import { palette } from '@/lib/darts';
import { useCallback, useMemo, useState } from 'react';
import { usePlayers } from '@/lib/players';
import {
  hasUnread,
  isCallMessage,
  loadContacts,
  loadJoinedCalls,
  loadOpenMatches,
  loadReadChats,
  timeLabel,
  useOnlineQuery,
} from '@/lib/online';
import {
  OnlineGate,
  OnlineError,
  Presence,
  OpenMatches,
  UnreadEnvelope,
} from '@/components/OnlineUI';

export default function Messages() {
  const session = usePlayers((s) => s.session);
  const ready = usePlayers((s) => s.ready);
  if (!ready)
    return (
      <View className="bg-background flex-1 p-5">
        <LoadingRows />
      </View>
    );
  return session ? <OnlineMessages userId={session.user.id} /> : <LocalMessages />;
}
function OnlineMessages({ userId }: { userId: string }) {
  const [joined, setJoined] = useState<Record<string, number>>({});
  const [read, setRead] = useState<Record<string, string>>({});
  useFocusEffect(
    useCallback(() => {
      void loadJoinedCalls().then(setJoined);
      void loadReadChats().then(setRead);
    }, []),
  );
  const query = useOnlineQuery(
    `inbox:${userId}`,
    useCallback(async () => {
      const [contacts, matches] = await Promise.all([loadContacts(), loadOpenMatches()]);
      return { contacts, matches };
    }, []),
  );
  const insets = useSafeAreaInsets();
  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top }}>
      <FlatList
        data={useMemo(
          () =>
            [...(query.data?.contacts.filter((c) => c.last_body) ?? [])].sort((a, b) => {
              // Najprv neprečítané (abecedne), potom ostatné (abecedne).
              const ua = hasUnread(a, userId, read) ? 0 : 1;
              const ub = hasUnread(b, userId, read) ? 0 : 1;
              if (ua !== ub) return ua - ub;
              return (a.nickname ?? '').localeCompare(b.nickname ?? '', 'sk');
            }),
          [query.data, read, userId],
        )}
        keyExtractor={(c) => c.user_id ?? ''}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 32,
          flexGrow: 1,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View className="mb-5">
            <View className="flex-row items-center justify-between gap-3">
              <Heading>Správy</Heading>
              <Button variant="secondary" size="sm" onPress={() => router.push('/friends')}>
                <Button.Label>Napísať</Button.Label>
              </Button>
            </View>
            <OnlineError error={query.error} retry={() => void query.refresh()} />
            {query.data && <OpenMatches matches={query.data.matches} userId={userId} />}
          </View>
        }
        renderItem={({ item }) => {
          const call = isCallMessage(item.last_body);
          const missedCall =
            call &&
            item.last_sender_id !== userId &&
            (joined[item.user_id ?? ''] ?? 0) <= new Date(item.last_message_at ?? 0).getTime();
          return (
            <PressableFeedback
              className="flex-row items-start gap-3 py-3"
              onPress={() =>
                router.push({ pathname: '/conversation/[id]', params: { id: item.user_id ?? '' } })
              }
            >
              <View className="flex-1 gap-2">
                <View className="flex-row gap-3">
                  <Txt
                    className="flex-1"
                    numberOfLines={1}
                    style={{ fontFamily: 'Inter_600SemiBold' }}
                  >
                    @{item.nickname}
                  </Txt>
                  {hasUnread(item, userId, read) ? <UnreadEnvelope /> : null}
                  {item.last_message_at && (
                    <Txt className="text-muted text-[11px]">{timeLabel(item.last_message_at)}</Txt>
                  )}
                </View>
                <Presence
                  online={!!item.online}
                  playing={!!item.in_match}
                  unknown={!!query.error}
                />
                {call ? (
                  <Txt
                    numberOfLines={2}
                    className="text-muted text-[13px] leading-5"
                    style={
                      missedCall
                        ? { color: palette.danger, fontFamily: 'Inter_600SemiBold' }
                        : undefined
                    }
                  >
                    {missedCall ? '📹 Miss call' : '📹 Videohovor'}
                  </Txt>
                ) : (
                  <Txt className="text-muted text-[13px] leading-5" numberOfLines={2}>
                    {item.last_sender_id === userId ? 'Ty: ' : ''}
                    {item.last_body}
                  </Txt>
                )}
              </View>
            </PressableFeedback>
          );
        }}
        ListEmptyComponent={
          <OnlineGate>
            {query.loading ? (
              <LoadingRows />
            ) : !query.error ? (
              <Empty
                chat
                text="Tu nájdeš správy od priateľov."
                action="Napísať priateľovi"
                onPress={() => router.push('/friends')}
              />
            ) : null}
          </OnlineGate>
        }
      />
    </View>
  );
}

function LocalMessages() {
  const friends = useDarts((s) => s.friends);
  const messages = useDarts((s) => s.messages);
  const hydrated = useDarts((s) => s.hydrated);
  const insets = useSafeAreaInsets();
  const conversations = friends
    .map((friend) => ({ friend, last: messages.filter((m) => m.friendId === friend.id).at(-1) }))
    .filter((c) => c.last);
  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top }}>
      <FlatList
        data={hydrated ? conversations : []}
        keyExtractor={(c) => c.friend.id}
        contentContainerStyle={{
          padding: 20,
          flexGrow: 1,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View className="mb-5">
            <Heading>Správy</Heading>
            <Button variant="secondary" className="mt-4" onPress={() => router.push('/account')}>
              <Button.Label>Prihlásiť sa pre skutočné správy</Button.Label>
            </Button>
            <Txt className="text-muted mt-3 text-[13px]">
              Ukážkové konverzácie · správy ostávajú u teba
            </Txt>
          </View>
        }
        renderItem={({ item }) => (
          <PressableFeedback
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.friend.id } })}
            className="flex-row gap-3 py-3"
          >
            <Avatar friend={item.friend} size={52} />
            <View className="flex-1 gap-2">
              <View className="flex-row gap-2">
                <Txt
                  className="flex-1"
                  numberOfLines={1}
                  style={{ fontFamily: 'Inter_600SemiBold' }}
                >
                  {item.friend.name}
                </Txt>
                <Txt className="text-muted text-[11px]">{item.last?.time}</Txt>
              </View>
              <Txt className="text-muted text-[13px] leading-5" numberOfLines={2}>
                {item.last?.mine ? 'Ty: ' : ''}
                {item.last?.text}
              </Txt>
            </View>
          </PressableFeedback>
        )}
        ListEmptyComponent={
          !hydrated ? (
            <LoadingRows />
          ) : (
            <Empty
              chat
              text="Tu nájdeš svoje konverzácie."
              action="Vybrať priateľa"
              onPress={() => router.push('/friends')}
            />
          )
        }
      />
    </View>
  );
}

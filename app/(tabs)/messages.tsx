import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, PressableFeedback } from 'heroui-native';
import { router, useFocusEffect } from 'expo-router';
import { Heading, Txt, Avatar, Empty, LoadingRows } from '@/components/DartsUI';
import { useDarts } from '@/lib/darts';
import { palette } from '@/lib/darts';
import { useCallback, useMemo, useState } from 'react';
import { PenLine } from 'lucide-react-native';
import { InboxSearch, PresenceAvatar, WaitingForYou } from '@/components/Inbox';
import { parseChallenge, TRAINING_TITLES } from '@/lib/challenge';

import { usePlayers } from '@/lib/players';
import {
  hasUnread,
  callKind,
  incomingCallState,
  isCallMessage,
  loadContacts,
  loadJoinedCalls,
  loadOpenMatches,
  loadReadChats,
  timeLabel,
  useOnlineQuery,
} from '@/lib/online';
import { OnlineGate, OnlineError, UnreadEnvelope } from '@/components/OnlineUI';

/** Farba tlačidiel „secondary“ — neprečítaná konverzácia má celú kartu v nej. */
const SECONDARY = '#384d78';
/** Výzva v náhľade: krátko namiesto celého textu karty. */
function challengeText(body: string | null) {
  const c = parseChallenge(body);
  return c
    ? `🏆 Výzva · ${TRAINING_TITLES[c.mode]} ${c.target}${c.unit ? ` ${c.unit}` : ''}`
    : body;
}

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
  const [search, setSearch] = useState('');
  const friends = usePlayers((s) => s.friends);
  const avatars = useMemo(
    () => new Map(friends.map((f) => [f.id, f.avatarUrl] as const)),
    [friends],
  );
  // Od najnovšej správy hore po najstaršiu; hľadanie podľa mena alebo textu správy.
  const conversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(query.data?.contacts.filter((c) => c.last_body) ?? [])]
      .filter(
        (c) =>
          !q ||
          (c.nickname ?? '').toLowerCase().includes(q) ||
          (c.last_body ?? '').toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          (b.last_message_at ? Date.parse(b.last_message_at) : 0) -
          (a.last_message_at ? Date.parse(a.last_message_at) : 0),
      );
  }, [query.data, search]);
  // Výzvy na tréning, ktoré mi priateľ poslal ako poslednú správu.
  const challenges = useMemo(
    () =>
      (query.data?.contacts ?? []).flatMap((c) => {
        const challenge =
          c.last_sender_id && c.last_sender_id !== userId ? parseChallenge(c.last_body) : null;
        return challenge && c.user_id
          ? [{ fromId: c.user_id, fromNick: c.nickname ?? '', challenge }]
          : [];
      }),
    [query.data, userId],
  );
  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top }}>
      <FlatList
        data={conversations}
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
                <PenLine size={16} color={palette.yellow} strokeWidth={1.8} />
                <Button.Label>Napísať</Button.Label>
              </Button>
            </View>
            <OnlineError error={query.error} retry={() => void query.refresh()} />
            {query.data && (
              <WaitingForYou
                matches={query.data.matches}
                challenges={challenges}
                userId={userId}
                onChanged={() => void query.refresh()}
              />
            )}
            <InboxSearch value={search} onChange={setSearch} />
            {conversations.length > 0 && (
              <Txt
                className="text-muted mt-5 text-[12px]"
                style={{ fontFamily: 'Inter_700Bold', letterSpacing: 0.5 }}
              >
                KONVERZÁCIE
              </Txt>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const call = isCallMessage(item.last_body);
          const missedCall =
            call &&
            item.last_sender_id !== userId &&
            (joined[item.user_id ?? ''] ?? 0) <= new Date(item.last_message_at ?? 0).getTime();
          // Čerstvá prichádzajúca pozvánka (volajúci asi čaká) sa zvýrazní zeleno.
          const waitingCall =
            call &&
            item.last_sender_id !== userId &&
            incomingCallState(item.last_message_at ?? 0, joined[item.user_id ?? ''] ?? 0) ===
              'waiting';
          // Neprečítaná konverzácia: celá karta modrá (ako aktívna voľba), text svetlý.
          const unread = hasUnread(item, userId, read);
          const fg = unread ? '#FFFFFF' : undefined;
          const peerId = item.user_id ?? '';
          return (
            <PressableFeedback
              className={`mb-2 flex-row items-center gap-3 rounded-2xl p-3 ${unread ? '' : 'bg-surface'}`}
              style={unread ? { backgroundColor: SECONDARY } : undefined}
              onPress={() =>
                router.push({ pathname: '/conversation/[id]', params: { id: peerId } })
              }
            >
              <PresenceAvatar
                name={item.nickname ?? ''}
                avatarUrl={avatars.get(peerId)}
                online={!!item.online}
                playing={!!item.in_match}
                training={!!item.training}
                ring={unread ? SECONDARY : palette.surface}
              />
              <View className="flex-1 gap-1">
                <View className="flex-row items-center gap-2">
                  <Txt
                    className="flex-1"
                    numberOfLines={1}
                    style={{
                      fontFamily: unread ? 'Inter_700Bold' : 'Inter_600SemiBold',
                      color: fg,
                    }}
                  >
                    @{item.nickname}
                  </Txt>
                  {item.last_message_at && (
                    <Txt
                      className={`text-[11px] ${unread ? '' : 'text-muted'}`}
                      style={
                        unread ? { fontFamily: 'Inter_700Bold', color: palette.yellow } : undefined
                      }
                    >
                      {timeLabel(item.last_message_at)}
                    </Txt>
                  )}
                </View>
                <View className="flex-row items-center gap-2">
                  {unread ? <UnreadEnvelope color={palette.yellow} /> : null}
                  {call ? (
                    <Txt
                      numberOfLines={1}
                      className="flex-1 text-[13px] leading-5"
                      style={
                        waitingCall
                          ? {
                              color: unread ? '#8EE0B5' : palette.success,
                              fontFamily: 'Inter_600SemiBold',
                            }
                          : missedCall
                            ? {
                                color: unread ? '#FFB3BE' : palette.danger,
                                fontFamily: 'Inter_600SemiBold',
                              }
                            : { color: fg ?? palette.muted }
                      }
                    >
                      {waitingCall
                        ? 'Prichádzajúci hovor'
                        : missedCall
                          ? 'Zmeškaný hovor'
                          : callKind(item.last_body) === 'audio'
                            ? 'Hlasový hovor'
                            : 'Videohovor'}
                    </Txt>
                  ) : (
                    <Txt
                      className={`flex-1 text-[13px] leading-5 ${unread ? '' : 'text-muted'}`}
                      style={unread ? { fontFamily: 'Inter_600SemiBold', color: fg } : undefined}
                      numberOfLines={1}
                    >
                      {item.last_sender_id === userId ? 'Ty: ' : ''}
                      {challengeText(item.last_body)}
                    </Txt>
                  )}
                </View>
              </View>
            </PressableFeedback>
          );
        }}
        ListEmptyComponent={
          <OnlineGate>
            {query.loading ? (
              <LoadingRows />
            ) : search.trim() ? (
              <Txt className="text-muted mt-2 text-center">Nič sa nenašlo.</Txt>
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
  // Od najnovšej správy hore (správy sú uložené v poradí, v akom prišli).
  const conversations = friends
    .map((friend) => ({ friend, last: messages.filter((m) => m.friendId === friend.id).at(-1) }))
    .filter((c) => c.last)
    .sort((a, b) => messages.lastIndexOf(b.last!) - messages.lastIndexOf(a.last!));
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
              Lokálne konverzácie · správy ostávajú u teba
            </Txt>
          </View>
        }
        renderItem={({ item }) => (
          <PressableFeedback
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.friend.id } })}
            className="bg-surface mb-2 flex-row gap-3 rounded-2xl p-4"
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

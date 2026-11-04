import { useCallback, useMemo, useRef, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input } from 'heroui-native';
import { Send, Video } from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Txt, Empty, LoadingRows } from '@/components/DartsUI';
import { OnlineGate, OnlineError, MatchInviteCard, Presence, OpenMatches } from '@/components/OnlineUI';
import { feedback, palette } from '@/lib/darts';
import { bilt } from '@/lib/bilt';
import VideoCall from '@/components/VideoCall';
import { getCallCredentials } from '@/lib/video';
import { notifyRecipient } from '@/lib/sendPush';
import { playerError, usePlayers } from '@/lib/players';
import {
  loadContacts,
  loadOpenMatches,
  timeLabel,
  useOnlineQuery,
  uuidPattern,
  type DirectMessage,
} from '@/lib/online';

export default function Conversation() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const userId = usePlayers((s) => s.session?.user.id);
  return <ConversationContent key={`${userId ?? 'guest'}:${id}`} id={id} userId={userId} />;
}

/** Pozvánka k videohovoru v chate — správa, čo sa vykreslí ako karta s tlačidlom. */
export const CALL_PREFIX = '📹call:';
export function isCallMessage(body: string): boolean {
  return body.startsWith(CALL_PREFIX);
}
function ConversationContent({ id, userId }: { id: string; userId: string | undefined }) {
  const myNickname = usePlayers((s) => s.profile?.nickname ?? '');
  const key = userId && uuidPattern.test(id) ? `${userId}:${id}` : null;
  const loader = useCallback(async () => {
    if (!userId || !uuidPattern.test(id)) return null;
    const [result, contacts, matches] = await Promise.all([
      bilt
        .from('direct_messages')
        .select('*')
        .or(
          `and(sender_id.eq.${userId},recipient_id.eq.${id}),and(sender_id.eq.${id},recipient_id.eq.${userId})`,
        )
        .order('id', { ascending: false })
        .limit(50),
      loadContacts(),
      loadOpenMatches(),
    ]);
    if (result.error) throw new Error(result.error.message);
    return {
      messages: result.data ?? [],
      contact: contacts.find((c: any) => c.user_id === id),
      matches: matches.filter((m: any) => m.host_id === id || m.guest_id === id),
    };
  }, [id, userId]);
  const query = useOnlineQuery(key, loader);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [callOpen, setCallOpen] = useState(false);
  const [micWanted, setMicWanted] = useState(true);
  // Credentials pre súkromnú miestnosť dvojice (stabilné počas konverzácie).
  const loadCallCredentials = useCallback(() => getCallCredentials(id), [id]);
  /** Tlačidlo kamery v chate: pošle pozvánku k hovoru a rovno otvorí miestnosť. */
  const startCall = async () => {
    if (!userId || pending || !key || query.error) return;
    setPending(true);
    setError('');
    try {
      const { data, error: e } = await bilt.rpc('send_direct_message', {
        peer: id,
        message_body: `${CALL_PREFIX}${Date.now()}`,
        client_request: Crypto.randomUUID(),
      });
      if (e) throw new Error(e.message);
      if (!data?.[0]) throw new Error('Pozvánku k hovoru sa nepodarilo odoslať.');
      if (usePlayers.getState().session?.user.id !== userId) return;
      setCallOpen(true);
      feedback.success();
      const invitingNick = usePlayers.getState().profile?.nickname;
      if (invitingNick)
        notifyRecipient(id, `@${invitingNick}`, '📹 Videohovor — klepni pre pripojenie', `/conversation/${userId}`);
      await query.refresh();
    } catch (e) {
      if (usePlayers.getState().session?.user.id === userId) {
        setError(
          playerError({
            message: e instanceof Error ? e.message : 'Hovor sa nepodarilo začať.',
          }),
        );
        feedback.error();
      }
    } finally {
      setPending(false);
    }
  };
  const [older, setOlder] = useState<{
    key: string;
    rows: DirectMessage[];
    hasMore: boolean;
  } | null>(null);
  const [previousPage, setPreviousPage] = useState(query.data);
  if (query.data !== previousPage) {
    setPreviousPage(query.data);
    if (key && query.data) {
      const previous = older?.key === key ? older : null;
      const merged = [
        ...new Map(
          [...(previous?.rows ?? []), ...query.data.messages].map((m) => [m.id, m]),
        ).values(),
      ];
      setOlder({
        key,
        rows: merged,
        hasMore: previous?.hasMore ?? query.data.messages.length === 50,
      });
    }
  }
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const request = useRef<{ key: string; body: string; id: string } | null>(null);
  const insets = useSafeAreaInsets();
  const messages = useMemo(() => {
    const rows = [...(query.data?.messages ?? []), ...(older?.key === key ? older.rows : [])];
    return [...new Map(rows.map((m) => [m.id, m])).values()].sort((a, b) => b.id - a.id);
  }, [query.data, older, key]);
  const send = async () => {
    const body = text.trim();
    if (!body || pending || !key) return;
    setPending(true);
    setError('');
    if (request.current?.body !== body || request.current.key !== key)
      request.current = { key, body, id: Crypto.randomUUID() };
    try {
      const { data, error: e } = await bilt.rpc('send_direct_message', {
        peer: id,
        message_body: body,
        client_request: request.current.id,
      });
      if (e) throw new Error(e.message);
      if (!data?.[0])
        throw new Error('Správu nemožno odoslať. Skontroluj, či ste stále priatelia.');
      if (usePlayers.getState().session?.user.id !== userId) return;
      // Keep sent messages when they leave the latest page.
      setOlder((s) => ({
        key,
        rows: [...(s?.key === key ? s.rows : []), data[0]],
        hasMore: s?.key === key ? s.hasMore : (query.data?.messages.length ?? 0) === 50,
      }));
      setText('');
      request.current = null;
      feedback.success();
      // Backend pošle príjemcovi push notifikáciu (ak má povolené).
      if (myNickname) notifyRecipient(id, `@${myNickname}`, body, `/conversation/${userId}`);
      await query.refresh();
    } catch (e) {
      if (usePlayers.getState().session?.user.id === userId) {
        setError(
          playerError({
            message: e instanceof Error ? e.message : 'Správu sa nepodarilo odoslať.',
          }),
        );
        feedback.error();
      }
    } finally {
      setPending(false);
    }
  };
  const loadOlder = async () => {
    if (!userId || !key || loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    setHistoryError('');
    try {
      const { data, error: e } = await bilt
        .from('direct_messages')
        .select('*')
        .or(
          `and(sender_id.eq.${userId},recipient_id.eq.${id}),and(sender_id.eq.${id},recipient_id.eq.${userId})`,
        )
        .lt('id', messages.at(-1)!.id)
        .order('id', { ascending: false })
        .limit(50);
      if (e) throw new Error(e.message);
      if (usePlayers.getState().session?.user.id !== userId) return;
      setOlder((s) => ({
        key,
        rows: [...(s?.key === key ? s.rows : []), ...(data ?? [])],
        hasMore: (data?.length ?? 0) === 50,
      }));
    } catch (e) {
      setHistoryError(
        playerError({
          message: e instanceof Error ? e.message : 'Staršie správy sa nepodarilo načítať.',
        }),
      );
      feedback.error();
    } finally {
      setLoadingOlder(false);
    }
  };
  const contact = query.data?.contact;
  return (
    <KeyboardAvoidingView
      className="bg-background flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: contact?.nickname ? `@${contact.nickname}` : 'Správy' }} />
      <View className="w-full max-w-xl flex-1 self-center">
        <View className="px-5 pt-3">
          <OnlineGate>
            {query.loading ? (
              <LoadingRows />
            ) : contact ? (
              <View className="flex-row items-center justify-between gap-3">
                <Presence online={!!contact.online} unknown={!!query.error} />
                <View className="flex-row items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    isIconOnly
                    accessibilityLabel="Videohovor"
                    isDisabled={pending || !!query.error}
                    onPress={() => void startCall()}
                  >
                    <Video size={19} strokeWidth={1.8} color={palette.ink} />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/online/new', params: { friendId: id } })}
                  >
                    <Button.Label>Pozvať na zápas</Button.Label>
                  </Button>
                </View>
              </View>
            ) : !query.error ? (
              <Empty
                text="Táto konverzácia nie je dostupná."
                action="Vybrať priateľa"
                onPress={() => router.replace('/friends')}
              />
            ) : null}
          </OnlineGate>
          <OnlineError error={query.error} retry={() => void query.refresh()} />
          {query.data && userId && <OpenMatches matches={query.data.matches.filter((m: any) => m.status !== 'invited')} userId={userId} />}
          {query.data &&
            userId &&
            query.data.matches
              .filter((m: any) => m.status === 'invited')
              .map((m: any) => (
                <MatchInviteCard
                  key={m.id}
                  match={m}
                  userId={userId}
                  onChanged={() => void query.refresh()}
                />
              ))}
          {callOpen && userId && (
            <View className="my-2">
              <VideoCall
                matchId={`dm:${userId}:${id}`}
                onLeave={() => setCallOpen(false)}
                large
                micWanted={micWanted}
                onMicChange={setMicWanted}
                getCredentials={loadCallCredentials}
                peerName={contact?.nickname}
              />
            </View>
          )}
        </View>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            if (isCallMessage(item.body)) {
              return (
                <Animated.View
                  entering={FadeIn.duration(160)}
                  exiting={FadeOut.duration(100)}
                  style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}
                >
                  <View className="bg-surface gap-2 rounded-2xl p-4">
                    <View className="flex-row items-center gap-2">
                      <Video size={18} color={palette.ink} strokeWidth={1.8} />
                      <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>
                        {mine ? 'Pozval si priateľa k hovoru' : 'Pozvánka k videohovoru'}
                      </Txt>
                    </View>
                    <Button
                      variant="secondary"
                      isDisabled={callOpen}
                      onPress={() => setCallOpen(true)}
                    >
                      <Button.Label>{callOpen ? 'Hovor prebieha' : 'Pripojiť sa'}</Button.Label>
                    </Button>
                    <Txt className="text-muted text-right text-[11px]">
                      {new Date(item.created_at).toLocaleDateString('sk-SK')} ·{' '}
                      {timeLabel(item.created_at)}
                    </Txt>
                  </View>
                </Animated.View>
              );
            }
            return (
              <Animated.View
                entering={FadeIn.duration(160)}
                exiting={FadeOut.duration(100)}
                style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}
              >
                <View
                  className={
                    mine
                      ? 'bg-ink rounded-2xl rounded-br-sm px-4 py-3'
                      : 'bg-surface rounded-2xl rounded-bl-sm px-4 py-3'
                  }
                >
                  <Txt className={mine ? 'leading-6 text-white' : 'leading-6'}>{item.body}</Txt>
                  <Txt
                    className={
                      mine
                        ? 'text-on-ink mt-2 text-right text-[11px]'
                        : 'text-muted mt-2 text-right text-[11px]'
                    }
                  >
                    {new Date(item.created_at).toLocaleDateString('sk-SK')} ·{' '}
                    {timeLabel(item.created_at)}
                    {mine ? ' · Odoslané' : ''}
                  </Txt>
                </View>
              </Animated.View>
            );
          }}
          ListEmptyComponent={
            contact && !query.loading && !query.error ? (
              <Empty
                chat
                text="Napíš priateľovi, či si chce zahrať."
                action="Napísať pozdrav"
                onPress={() => setText('Ahoj, dáme si šípky?')}
              />
            ) : undefined
          }
          ListFooterComponent={
            <View>
              <OnlineError error={historyError} retry={() => void loadOlder()} />
              {(older?.key === key ? older.hasMore : (query.data?.messages.length ?? 0) === 50) &&
                messages.length > 0 && (
                  <Button
                    variant="ghost"
                    isDisabled={loadingOlder}
                    onPress={() => void loadOlder()}
                  >
                    <Button.Label>{loadingOlder ? 'Načítavam…' : 'Staršie správy'}</Button.Label>
                  </Button>
                )}
            </View>
          }
        />
        <View
          className="bg-surface border-border border-t px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {!!error && (
            <Txt className="text-danger mb-2 text-[13px]" accessibilityRole="alert">
              {error}
            </Txt>
          )}
          {contact && (
            <View className="flex-row items-end gap-2">
              <Input
                className="bg-background max-h-28 flex-1"
                value={text}
                multiline
                maxLength={2000}
                editable={!pending}
                placeholder="Napíš správu…"
                accessibilityLabel="Správa"
                onChangeText={setText}
              />
              <Button
                isIconOnly
                isDisabled={pending || !text.trim() || !!query.error}
                accessibilityLabel={pending ? 'Odosielam správu' : 'Odoslať správu'}
                onPress={() => void send()}
              >
                <Send size={21} strokeWidth={1.8} color={palette.ink} />
              </Button>
            </View>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onPress={() => router.dismissTo('/messages')}
          >
            <Button.Label>Všetky správy</Button.Label>
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

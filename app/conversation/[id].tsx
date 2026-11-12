import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input } from 'heroui-native';
import { Send, Video, X } from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Txt, Empty, LoadingRows } from '@/components/DartsUI';
import {
  OnlineGate,
  OnlineError,
  MatchInviteCard,
  Presence,
  OpenMatches,
} from '@/components/OnlineUI';
import { feedback, palette } from '@/lib/darts';
import { bilt } from '@/lib/bilt';
import VideoCall from '@/components/VideoCall';
import { getCallCredentials, loadCameraPrefs, warmUpCamera, type CameraPrefs } from '@/lib/video';
import { notifyRecipient } from '@/lib/sendPush';
import { playerError, usePlayers } from '@/lib/players';
import {
  loadContacts,
  CALL_PREFIX,
  incomingCallState,
  isCallMessage,
  loadJoinedCalls,
  loadOpenMatches,
  markCallJoined,
  markChatRead,
  timeLabel,
  useOnlineQuery,
  uuidPattern,
  type DirectMessage,
} from '@/lib/online';

export default function Conversation() {
  const { id = '', autoJoin } = useLocalSearchParams<{ id?: string; autoJoin?: string }>();
  const userId = usePlayers((s) => s.session?.user.id);
  return (
    <ConversationContent
      key={`${userId ?? 'guest'}:${id}`}
      id={id}
      userId={userId}
      autoJoin={autoJoin}
    />
  );
}

/** Pozvánka k videohovoru v chate — správa, čo sa vykreslí ako karta s tlačidlom. */
function ConversationContent({
  id,
  userId,
  autoJoin,
}: {
  id: string;
  userId: string | undefined;
  autoJoin?: string;
}) {
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setText('');
    setError('');
  }, []);
  const [callOpen, setCallOpen] = useState(false);
  const [joined, setJoined] = useState<Record<string, number>>({});
  const [camPrefs, setCamPrefs] = useState<CameraPrefs>({ match: 'environment', call: 'user' });
  useEffect(() => {
    void loadCameraPrefs().then(setCamPrefs);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadJoinedCalls().then(setJoined);
    }, []),
  );
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
      void markCallJoined(id);
      setJoined((j) => ({ ...j, [id]: Date.now() }));
      feedback.success();
      const invitingNick = usePlayers.getState().profile?.nickname;
      if (invitingNick)
        notifyRecipient(
          id,
          `@${invitingNick}`,
          '📹 Videohovor — klepni pre pripojenie',
          // Ťuknutie na notifikáciu (aj zo zatvorenej appky) rovno pripojí, ak pozvánka ešte platí.
          `/conversation/${userId}?autoJoin=1`,
        );
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
  /** Pripojenie k čakajúcej pozvánke (tlačidlo „Pripojiť sa“). */
  const joinCall = useCallback(() => {
    void warmUpCamera(camPrefs.call, camPrefs.callDeviceId).catch(() => undefined);
    void markCallJoined(id);
    setJoined((j) => ({ ...j, [id]: Date.now() }));
    setCallOpen(true);
  }, [camPrefs.call, camPrefs.callDeviceId, id]);
  /** Odmietnutie prichádzajúcej pozvánky — karta ostane ako zmeškaná (bez tlačidla). */
  const declineCall = useCallback(() => {
    void markCallJoined(id);
    setJoined((j) => ({ ...j, [id]: Date.now() }));
    feedback.selection();
  }, [id]);
  /** Zavolanie späť: nová pozvánka + rovno otvorím miestnosť. */
  const callBack = useCallback(() => {
    void warmUpCamera(camPrefs.call, camPrefs.callDeviceId).catch(() => undefined);
    void markCallJoined(id);
    setJoined((j) => ({ ...j, [id]: Date.now() }));
    void startCall();
  }, [camPrefs.call, camPrefs.callDeviceId, id, startCall]);
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
  // Upraviť ide len vlastnú poslednú textovú správu (podržanie prsta).
  const newestMineId = messages.find((m) => m.sender_id === userId && !isCallMessage(m.body))?.id;
  // Príchod zo zvoniaceho prehľadu (notifikácia): čakajúcu pozvánku prijmem rovno.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoin !== '1' || autoJoined.current || callOpen || !query.data || !userId) return;
    const fresh = query.data.messages.some(
      (m) =>
        m.sender_id !== userId &&
        isCallMessage(m.body) &&
        incomingCallState(m.created_at, joined[id] ?? 0) === 'waiting',
    );
    if (!fresh) return;
    autoJoined.current = true;
    joinCall();
  }, [autoJoin, callOpen, joinCall, joined, id, query.data, userId]);
  const startEdit = (item: DirectMessage) => {
    if (pending || item.id !== newestMineId) return;
    setEditingId(item.id);
    setText(item.body);
    setError('');
    feedback.selection();
  };
  /** Uloženie úpravy vlastnej poslednej správy. */
  const saveEdit = async (body: string) => {
    if (editingId === null || !key) return;
    setPending(true);
    setError('');
    try {
      const { data, error: e } = await bilt.rpc('edit_direct_message', {
        message_id: editingId,
        new_body: body,
      });
      if (e) throw new Error(e.message);
      const updated = data?.[0];
      if (!updated) throw new Error('Správu sa nepodarilo upraviť. Obnov správy a skús to znova.');
      if (usePlayers.getState().session?.user.id !== userId) return;
      setOlder((s) =>
        s?.key === key ? { ...s, rows: s.rows.map((m) => (m.id === updated.id ? updated : m)) } : s,
      );
      setEditingId(null);
      setText('');
      feedback.success();
      await query.refresh();
    } catch (e) {
      if (usePlayers.getState().session?.user.id === userId) {
        setError(
          playerError({
            message: e instanceof Error ? e.message : 'Správu sa nepodarilo upraviť.',
          }),
        );
        feedback.error();
      }
    } finally {
      setPending(false);
    }
  };
  // Otvorená konverzácia = prečítané: zapamätá najnovšiu správu.
  useEffect(() => {
    const newest = messages[0]?.created_at;
    if (newest) void markChatRead(id, newest);
  }, [messages, id]);
  const send = async () => {
    const body = text.trim();
    if (!body || pending || !key) return;
    if (editingId !== null) {
      await saveEdit(body);
      return;
    }
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
                <Presence
                  online={!!contact.online}
                  playing={!!contact.in_match}
                  unknown={!!query.error}
                />
                <View className="flex-row items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    isIconOnly
                    accessibilityLabel="Videohovor"
                    isDisabled={pending || !!query.error}
                    onPress={() => {
                      // Povolenie kamery musí prísť z gesta — predhrejeme ju ešte pred hovorom.
                      void warmUpCamera(camPrefs.call, camPrefs.callDeviceId).catch(
                        () => undefined,
                      );
                      void startCall();
                    }}
                  >
                    <Video size={19} strokeWidth={1.8} color={palette.ink} />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      router.push({ pathname: '/online/new', params: { friendId: id } })
                    }
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
          {query.data && userId && (
            <OpenMatches
              matches={query.data.matches.filter((m: any) => m.status !== 'invited')}
              userId={userId}
            />
          )}
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
                peerName={contact?.nickname ?? undefined}
                initialFacing={camPrefs.call}
                initialDeviceId={camPrefs.callDeviceId}
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
              // Vlastná pozvánka: tlačidlo len kým som v hovore. Prichádzajúca:
              // čaká → „Pripojiť sa“ + „Odmietnuť“, zmeškaná → „Zavolať späť“, inak nič.
              const inviteState = mine
                ? 'outgoing'
                : incomingCallState(item.created_at, joined[id] ?? 0);
              return (
                <Animated.View
                  entering={FadeIn.duration(160)}
                  exiting={FadeOut.duration(100)}
                  style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}
                >
                  <View className="bg-surface gap-2 rounded-2xl p-4">
                    <View className="flex-row items-center gap-2">
                      <Video size={18} color={palette.ink} strokeWidth={1.8} />
                      <Txt
                        style={
                          inviteState === 'missed'
                            ? { fontFamily: 'Inter_600SemiBold', color: palette.danger }
                            : inviteState === 'waiting'
                              ? { fontFamily: 'Inter_600SemiBold', color: palette.success }
                              : { fontFamily: 'Inter_600SemiBold' }
                        }
                      >
                        {mine
                          ? 'Pozval si priateľa k hovoru'
                          : inviteState === 'waiting'
                            ? 'Prichádzajúci hovor'
                            : inviteState === 'missed'
                              ? '📹 Miss call'
                              : '📹 Videohovor'}
                      </Txt>
                    </View>
                    {callOpen ? (
                      <Button variant="secondary" isDisabled>
                        <Button.Label>Hovor prebieha</Button.Label>
                      </Button>
                    ) : inviteState === 'waiting' ? (
                      <View className="gap-2">
                        <Button variant="secondary" onPress={joinCall}>
                          <Button.Label>Pripojiť sa</Button.Label>
                        </Button>
                        <Button variant="ghost" onPress={declineCall}>
                          <Button.Label>Odmietnuť</Button.Label>
                        </Button>
                      </View>
                    ) : inviteState === 'missed' ? (
                      <Button variant="secondary" onPress={callBack}>
                        <Button.Label>Zavolať späť</Button.Label>
                      </Button>
                    ) : null}
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
                <Pressable
                  onLongPress={mine ? () => startEdit(item) : undefined}
                  delayLongPress={400}
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
                </Pressable>
              </Animated.View>
            );
          }}
          ListEmptyComponent={
            contact && !query.loading && !query.error ? (
              // Invertovaný zoznam prevráti aj prázdny stav — vrátime ho späť.
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <Empty
                  chat
                  text="Napíš priateľovi, či si chce zahrať."
                  action="Napísať pozdrav"
                  onPress={() => setText('Ahoj, dáme si šípky?')}
                />
              </View>
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
            <>
              {editingId !== null && (
                <View className="mb-2 flex-row items-center justify-between">
                  <Txt className="text-muted text-[13px]">Upravuješ svoju správu</Txt>
                  <Button variant="ghost" size="sm" isDisabled={pending} onPress={cancelEdit}>
                    <X size={16} strokeWidth={1.8} color={palette.muted} />
                    <Button.Label>Zrušiť</Button.Label>
                  </Button>
                </View>
              )}
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
            </>
          )}
          <Button variant="ghost" size="sm" className="mt-1" onPress={() => router.dismissTo('/')}>
            <Button.Label>Späť domov</Button.Label>
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

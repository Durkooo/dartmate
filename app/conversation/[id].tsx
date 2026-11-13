import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from 'heroui-native';
import { Phone, Video, X } from 'lucide-react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { MessageComposer } from '@/components/MessageComposer';
import { MessagePhoto } from '@/components/MessagePhoto';
import {
  uploadMessagePhoto,
  removeDraftMessagePhoto,
  type MessagePhotoDraft,
} from '@/lib/messagePhotos';
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
import { closeCallNotifications } from '@/lib/callNotifications';
import { RESULT_HEADER, isResultMessage, resultLines } from '@/lib/matchResult';
import {
  REACTIONS,
  loadChatState,
  loadReactions,
  markRead,
  react,
  replyOf,
  sendTyping,
  setReply,
  snippet,
} from '@/lib/chatExtras';
import { playerError, usePlayers } from '@/lib/players';
import {
  loadContacts,
  CALL_PREFIX,
  callKind,
  type CallKind,
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
    const [result, contacts, matches, handledCalls] = await Promise.all([
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
      loadJoinedCalls(),
    ]);
    if (result.error) throw new Error(result.error.message);
    const messages: DirectMessage[] = result.data ?? [];
    // Doplnky (prečítané, píše…, reakcie) — bez nového backendu sú prázdne.
    const [chat, reactions] = await Promise.all([
      loadChatState(id),
      loadReactions(messages.map((m) => m.id)),
    ]);
    return {
      messages,
      chat,
      reactions,
      handledCalls,
      contact: contacts.find((c: any) => c.user_id === id),
      matches: matches.filter((m: any) => m.host_id === id || m.guest_id === id),
    };
  }, [id, userId]);
  const query = useOnlineQuery(key, loader);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<MessagePhotoDraft | null>(null);
  const uploadedPhoto = useRef<{ requestId: string; path: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  // Podržaná správa (ponuka reakcií / odpovede / úpravy) a správa, na ktorú odpovedám.
  const [menuFor, setMenuFor] = useState<DirectMessage | null>(null);
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const clearPhoto = () => {
    const uploaded = uploadedPhoto.current;
    uploadedPhoto.current = null;
    setPhoto(null);
    if (uploaded)
      void removeDraftMessagePhoto(uploaded.path).catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'Prílohu sa nepodarilo odstrániť.');
        feedback.error();
      });
  };
  const selectPhoto = (asset: ImagePickerAsset) => {
    clearPhoto();
    setEditingId(null);
    setError('');
    setPhoto({ asset, requestId: Crypto.randomUUID() });
  };
  useEffect(
    () => () => {
      const uploaded = uploadedPhoto.current;
      if (uploaded)
        void removeDraftMessagePhoto(uploaded.path).catch((failure: unknown) => {
          console.warn('Photo draft cleanup failed', failure);
        });
    },
    [],
  );
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setText('');
    setError('');
  }, []);
  const [callOpen, setCallOpen] = useState(false);
  const [kind, setKind] = useState<CallKind>('video');
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
  // Môj odchádzajúci hovor: ak ho položím skôr, než sa priateľ pripojí,
  // pošleme mu „Zmeškaný hovor“ (nahradí zvoniace upozornenie).
  const outgoing = useRef<{ id: number; kind: CallKind; peerJoined: boolean } | null>(null);
  const endOutgoing = useCallback(() => {
    const call = outgoing.current;
    outgoing.current = null;
    if (!call || call.peerJoined || !userId) return;
    const nick = usePlayers.getState().profile?.nickname;
    if (!nick) return;
    notifyRecipient(
      id,
      `@${nick}`,
      call.kind === 'audio' ? 'Zmeškaný hlasový hovor' : 'Zmeškaný videohovor',
      `/conversation/${userId}?missedCall=${call.id}${call.kind === 'audio' ? '&kind=audio' : ''}`,
    );
  }, [id, userId]);
  // Odchod z obrazovky počas čakania na priateľa = tiež zmeškaný hovor.
  const endOutgoingRef = useRef(endOutgoing);
  useEffect(() => {
    endOutgoingRef.current = endOutgoing;
  }, [endOutgoing]);
  useEffect(() => () => endOutgoingRef.current(), []);
  // Credentials pre súkromnú miestnosť dvojice (stabilné počas konverzácie).
  const loadCallCredentials = useCallback(() => getCallCredentials(id), [id]);
  const { error: callQueryError, refresh: refreshCallQuery } = query;
  /** Tlačidlo kamery v chate: pošle pozvánku k hovoru a rovno otvorí miestnosť. */
  const startCall = useCallback(
    async (nextKind: CallKind = 'video') => {
      if (!userId || pending || callOpen || !key || callQueryError) return;
      setPending(true);
      setError('');
      try {
        const { data, error: e } = await bilt.rpc('send_direct_message', {
          peer: id,
          message_body: `${CALL_PREFIX}${nextKind === 'audio' ? 'audio:' : ''}${Date.now()}`,
          client_request: Crypto.randomUUID(),
        });
        if (e) throw new Error(e.message);
        if (!data?.[0]) throw new Error('Pozvánku k hovoru sa nepodarilo odoslať.');
        if (usePlayers.getState().session?.user.id !== userId) return;
        setKind(nextKind);
        setMicWanted(true);
        setCallOpen(true);
        void markCallJoined(id);
        setJoined((j) => ({ ...j, [id]: Date.now() }));
        feedback.success();
        const invitingNick = usePlayers.getState().profile?.nickname;
        if (invitingNick)
          notifyRecipient(
            id,
            `@${invitingNick}`,
            nextKind === 'audio' ? 'Prichádzajúci hlasový hovor' : 'Prichádzajúci videohovor',
            // autoJoin: ťuknutie na upozornenie otvorí appku rovno v hovore.
            `/conversation/${userId}?autoJoin=${data[0].id}${nextKind === 'audio' ? '&kind=audio' : ''}`,
          );
        outgoing.current = { id: data[0].id, kind: nextKind, peerJoined: false };
        await refreshCallQuery();
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
    },
    [userId, pending, callOpen, key, callQueryError, refreshCallQuery, id],
  );
  const [older, setOlder] = useState<{
    key: string;
    rows: DirectMessage[];
    hasMore: boolean;
  } | null>(null);
  /** Pripojenie k čakajúcej pozvánke (tlačidlo „Pripojiť sa“). */
  const joinCall = useCallback(
    (nextKind: CallKind) => {
      if (nextKind === 'video')
        void warmUpCamera(camPrefs.call, camPrefs.callDeviceId).catch(() => undefined);
      closeCallNotifications(id);
      setKind(nextKind);
      setMicWanted(true);
      void markCallJoined(id);
      setJoined((j) => ({ ...j, [id]: Date.now() }));
      setCallOpen(true);
      feedback.success();
    },
    [camPrefs.call, camPrefs.callDeviceId, id],
  );
  const acceptInvitation = useCallback(
    async (invitation: DirectMessage) => {
      if (callOpen) return;
      const stored = await loadJoinedCalls();
      if (usePlayers.getState().session?.user.id !== userId) return;
      setJoined((current) => ({ ...current, [id]: Math.max(current[id] ?? 0, stored[id] ?? 0) }));
      if (incomingCallState(invitation.created_at, stored[id] ?? 0) === 'waiting')
        joinCall(callKind(invitation.body));
    },
    [callOpen, id, userId, joinCall],
  );
  /** Odmietnutie prichádzajúcej pozvánky — karta ostane ako zmeškaná (bez tlačidla). */
  const declineCall = useCallback(() => {
    closeCallNotifications(id);
    void markCallJoined(id);
    setJoined((j) => ({ ...j, [id]: Date.now() }));
    feedback.selection();
  }, [id]);
  /** Zavolanie späť: nová pozvánka + rovno otvorím miestnosť. */
  const callBack = useCallback(
    (nextKind: CallKind) => {
      if (nextKind === 'video')
        void warmUpCamera(camPrefs.call, camPrefs.callDeviceId).catch(() => undefined);
      void markCallJoined(id);
      setJoined((j) => ({ ...j, [id]: Date.now() }));
      void startCall(nextKind);
    },
    [camPrefs.call, camPrefs.callDeviceId, id, startCall],
  );
  const [previousPage, setPreviousPage] = useState(query.data);
  if (query.data !== previousPage) {
    setPreviousPage(query.data);
    if (key && query.data) {
      const stored = query.data.handledCalls;
      setJoined((current) => {
        const merged = { ...current };
        for (const [peer, at] of Object.entries(stored))
          merged[peer] = Math.max(merged[peer] ?? 0, at);
        return merged;
      });
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
  const { height: windowHeight } = useWindowDimensions();
  const messages = useMemo(() => {
    const rows = [...(query.data?.messages ?? []), ...(older?.key === key ? older.rows : [])];
    return [...new Map(rows.map((m) => [m.id, m])).values()].sort((a, b) => b.id - a.id);
  }, [query.data, older, key]);
  // Upraviť ide len vlastnú poslednú textovú správu (podržanie prsta).
  const newestMineId = messages.find(
    (m) =>
      m.sender_id === userId && !m.image_path && !isCallMessage(m.body) && !isResultMessage(m.body),
  )?.id;
  // Príchod zo zvoniaceho prehľadu (notifikácia): čakajúcu pozvánku prijmem rovno.
  const autoJoined = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!autoJoin || autoJoined.current === autoJoin || callOpen || !query.data || !userId)
      return undefined;
    const fresh = query.data.messages.find(
      (m) =>
        m.sender_id !== userId &&
        (autoJoin === '1' || String(m.id) === autoJoin) &&
        isCallMessage(m.body) &&
        incomingCallState(m.created_at, joined[id] ?? 0) === 'waiting',
    );
    if (!fresh) return undefined;
    // Synchronize with persisted acceptance/decline before accepting a routed invitation.
    // The foreground watcher may have handled it since this screen last loaded.
    let active = true;
    void loadJoinedCalls().then((storedJoined) => {
      if (
        !active ||
        autoJoined.current === autoJoin ||
        usePlayers.getState().session?.user.id !== userId ||
        incomingCallState(fresh.created_at, storedJoined[id] ?? 0) !== 'waiting'
      )
        return;
      autoJoined.current = autoJoin;
      joinCall(callKind(fresh.body));
    });
    return () => {
      active = false;
    };
  }, [autoJoin, callOpen, joined, id, query.data, userId, joinCall]);
  const startEdit = (item: DirectMessage) => {
    if (pending || item.id !== newestMineId || item.image_path) return;
    clearPhoto();
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
    // Priateľ uvidí „Prečítané“ pri svojich správach.
    if (messages[0]) markRead(id, messages[0].id);
  }, [messages, id]);
  const send = async () => {
    const body = text.trim();
    if ((!body && !photo) || pending || !key || !userId) return;
    if (editingId !== null) {
      await saveEdit(body);
      return;
    }
    setPending(true);
    setError('');
    if (request.current?.body !== body || request.current.key !== key)
      request.current = { key, body, id: Crypto.randomUUID() };
    try {
      let imagePath: string | null = null;
      if (photo) {
        if (uploadedPhoto.current?.requestId === photo.requestId) {
          imagePath = uploadedPhoto.current.path;
        } else {
          imagePath = await uploadMessagePhoto(photo, userId, id);
          uploadedPhoto.current = { requestId: photo.requestId, path: imagePath };
        }
        if (usePlayers.getState().session?.user.id !== userId) return;
      }
      const { data, error: e } =
        imagePath && photo
          ? await bilt.rpc('send_image_message', {
              peer: id,
              message_body: body,
              client_request: photo.requestId,
              photo_path: imagePath,
            })
          : await bilt.rpc('send_direct_message', {
              peer: id,
              message_body: body,
              client_request: request.current.id,
            });
      if (e) throw new Error(e.message);
      if (!data?.[0])
        throw new Error('Správu nemožno odoslať. Skontroluj, či ste stále priatelia.');
      if (usePlayers.getState().session?.user.id !== userId) return;
      if (replyTo) {
        setReply(data[0].id, replyTo.id);
        setReplyTo(null);
      }
      // Keep sent messages when they leave the latest page.
      setOlder((s) => ({
        key,
        rows: [...(s?.key === key ? s.rows : []), data[0]],
        hasMore: s?.key === key ? s.hasMore : (query.data?.messages.length ?? 0) === 50,
      }));
      setText('');
      setPhoto(null);
      uploadedPhoto.current = null;
      request.current = null;
      feedback.success();
      // Backend pošle príjemcovi push notifikáciu (ak má povolené).
      if (myNickname)
        notifyRecipient(id, `@${myNickname}`, body || 'Fotografia', `/conversation/${userId}`);
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
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Presence
                  online={!!contact.online}
                  playing={!!contact.in_match}
                  training={!!contact.training}
                  unknown={!!query.error}
                />
                <View className="flex-row flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    isIconOnly
                    accessibilityLabel="Hlasový hovor"
                    isDisabled={pending || callOpen || !!query.error}
                    onPress={() => void startCall('audio')}
                  >
                    <Phone size={19} strokeWidth={1.8} color={palette.yellow} />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    isIconOnly
                    accessibilityLabel="Videohovor"
                    isDisabled={pending || callOpen || !!query.error}
                    onPress={() => {
                      // Povolenie kamery musí prísť z gesta — predhrejeme ju ešte pred hovorom.
                      void warmUpCamera(camPrefs.call, camPrefs.callDeviceId).catch(
                        () => undefined,
                      );
                      void startCall();
                    }}
                  >
                    <Video size={19} strokeWidth={1.8} color={palette.yellow} />
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
            // Hovor je v pevnej hlavičke nad správami — keď je vyšší ako displej
            // (iPhone), dá sa v ňom posúvať, aby bolo vidno aj ovládanie kamery.
            <ScrollView
              className="my-2"
              style={{ maxHeight: Math.round(windowHeight * 0.72) }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              <VideoCall
                key={kind}
                audioOnly={kind === 'audio'}
                matchId={`dm:${userId}:${id}`}
                onLeave={() => {
                  endOutgoing();
                  setCallOpen(false);
                }}
                onPeerJoined={() => {
                  if (outgoing.current) outgoing.current.peerJoined = true;
                }}
                large
                micWanted={micWanted}
                onMicChange={setMicWanted}
                getCredentials={loadCallCredentials}
                peerName={contact?.nickname ?? undefined}
                initialFacing={camPrefs.call}
                initialDeviceId={camPrefs.callDeviceId}
                endWhenPeerLeaves
              />
            </ScrollView>
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
              const inviteKind = callKind(item.body);
              const CallIcon = inviteKind === 'audio' ? Phone : Video;
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
                      <CallIcon size={18} color={palette.ink} strokeWidth={1.8} />
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
                              ? 'Zmeškaný hovor'
                              : inviteKind === 'audio'
                                ? 'Hlasový hovor'
                                : 'Videohovor'}
                      </Txt>
                    </View>
                    {callOpen ? (
                      <Button variant="secondary" isDisabled>
                        <Button.Label>Hovor prebieha</Button.Label>
                      </Button>
                    ) : inviteState === 'waiting' ? (
                      <View className="gap-2">
                        <Button variant="secondary" onPress={() => void acceptInvitation(item)}>
                          <Button.Label>Prijať</Button.Label>
                        </Button>
                        <Button variant="ghost" onPress={declineCall}>
                          <Button.Label>Odmietnuť</Button.Label>
                        </Button>
                      </View>
                    ) : inviteState === 'missed' ? (
                      <Button variant="secondary" onPress={() => callBack(inviteKind)}>
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
                  onLongPress={() => {
                    setMenuFor(item);
                    feedback.selection();
                  }}
                  delayLongPress={400}
                  accessibilityHint="Podrž pre reakciu alebo odpoveď"
                >
                  <View
                    className={
                      mine
                        ? 'bg-ink rounded-2xl rounded-br-sm px-4 py-3'
                        : 'bg-surface rounded-2xl rounded-bl-sm px-4 py-3'
                    }
                    style={item.image_path ? { width: 232, maxWidth: '100%' } : undefined}
                  >
                    {(() => {
                      // Citácia správy, na ktorú táto odpovedá.
                      const replyId = replyOf(item);
                      if (replyId === null) return null;
                      const original = messages.find((m) => m.id === replyId);
                      return (
                        <View
                          className="mb-2 rounded-lg px-3 py-2"
                          style={{
                            borderLeftWidth: 3,
                            borderLeftColor: palette.yellow,
                            backgroundColor: mine ? 'rgba(255,255,255,0.08)' : palette.paper,
                          }}
                        >
                          <Txt
                            className={mine ? 'text-on-ink text-[12px]' : 'text-muted text-[12px]'}
                            style={{ fontFamily: 'Inter_600SemiBold' }}
                          >
                            {original
                              ? original.sender_id === userId
                                ? 'Ty'
                                : `@${contact?.nickname ?? ''}`
                              : 'Odpoveď'}
                          </Txt>
                          <Txt
                            numberOfLines={2}
                            className={mine ? 'text-on-ink text-[13px]' : 'text-muted text-[13px]'}
                          >
                            {original
                              ? snippet(original.body, !!original.image_path)
                              : 'Staršia správa'}
                          </Txt>
                        </View>
                      );
                    })()}
                    {item.image_path && <MessagePhoto path={item.image_path} mine={mine} />}
                    {isResultMessage(item.body) ? (
                      // Výsledok zápasu ako karta: prvý riadok (skóre) zvýraznený.
                      <View className="gap-1">
                        <Txt
                          className={mine ? 'text-on-ink text-[12px]' : 'text-muted text-[12px]'}
                        >
                          {RESULT_HEADER}
                        </Txt>
                        {resultLines(item.body).map((line, i) => (
                          <Txt
                            key={line}
                            className={mine ? 'text-white' : undefined}
                            style={
                              i === 0
                                ? {
                                    fontFamily: 'Inter_700Bold',
                                    fontSize: 18,
                                    fontVariant: ['tabular-nums'],
                                  }
                                : { fontSize: 13 }
                            }
                          >
                            {line}
                          </Txt>
                        ))}
                      </View>
                    ) : (
                      <Txt className={mine ? 'leading-6 text-white' : 'leading-6'}>{item.body}</Txt>
                    )}
                    <Txt
                      className={
                        mine
                          ? 'text-on-ink mt-2 text-right text-[11px]'
                          : 'text-muted mt-2 text-right text-[11px]'
                      }
                    >
                      {new Date(item.created_at).toLocaleDateString('sk-SK')} ·{' '}
                      {timeLabel(item.created_at)}
                      {mine
                        ? (query.data?.chat?.peerLastReadId ?? 0) >= item.id
                          ? ' · ✓✓ Prečítané'
                          : ' · ✓ Odoslané'
                        : ''}
                    </Txt>
                  </View>
                  {(() => {
                    // Reakcie pod bublinou (zoskupené, moja zvýraznená).
                    const list = (query.data?.reactions ?? []).filter(
                      (r) => r.messageId === item.id,
                    );
                    if (!list.length) return null;
                    const groups = REACTIONS.map((emoji) => ({
                      emoji,
                      count: list.filter((r) => r.emoji === emoji).length,
                      mineToo: list.some((r) => r.emoji === emoji && r.userId === userId),
                    })).filter((g) => g.count > 0);
                    return (
                      <View
                        className="-mt-2 flex-row gap-1"
                        style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginHorizontal: 8 }}
                      >
                        {groups.map((g) => (
                          <View
                            key={g.emoji}
                            className="flex-row items-center rounded-full px-2 py-0.5"
                            style={{
                              backgroundColor: palette.surface,
                              borderWidth: 1,
                              borderColor: g.mineToo ? palette.ink : palette.line,
                            }}
                          >
                            <Txt className="text-[13px]">
                              {g.emoji}
                              {g.count > 1 ? ` ${g.count}` : ''}
                            </Txt>
                          </View>
                        ))}
                      </View>
                    );
                  })()}
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
          {!!query.data?.chat?.peerTyping && (
            <Txt className="text-muted mb-1 text-[12px]" accessibilityLiveRegion="polite">
              @{contact?.nickname ?? ''} píše…
            </Txt>
          )}
          {contact && (
            <>
              {replyTo && editingId === null && (
                <View
                  className="mb-2 flex-row items-center gap-2 rounded-lg px-3 py-2"
                  style={{
                    borderLeftWidth: 3,
                    borderLeftColor: palette.yellow,
                    backgroundColor: palette.paper,
                  }}
                >
                  <View className="flex-1">
                    <Txt
                      className="text-muted text-[12px]"
                      style={{ fontFamily: 'Inter_600SemiBold' }}
                    >
                      Odpovedáš{' '}
                      {replyTo.sender_id === userId ? 'sebe' : `@${contact.nickname ?? ''}`}
                    </Txt>
                    <Txt numberOfLines={1} className="text-[13px]">
                      {snippet(replyTo.body, !!replyTo.image_path)}
                    </Txt>
                  </View>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    accessibilityLabel="Zrušiť odpoveď"
                    onPress={() => setReplyTo(null)}
                  >
                    <X size={16} strokeWidth={1.8} color={palette.muted} />
                  </Button>
                </View>
              )}
              {editingId !== null && (
                <View className="mb-2 flex-row items-center justify-between">
                  <Txt className="text-muted text-[13px]">Upravuješ svoju správu</Txt>
                  <Button variant="ghost" size="sm" isDisabled={pending} onPress={cancelEdit}>
                    <X size={16} strokeWidth={1.8} color={palette.muted} />
                    <Button.Label>Zrušiť</Button.Label>
                  </Button>
                </View>
              )}
              <MessageComposer
                text={text}
                onChangeText={(value) => {
                  setText(value);
                  if (value.trim() && editingId === null) sendTyping(id);
                }}
                photo={photo}
                onSelectPhoto={selectPhoto}
                onRemovePhoto={() => {
                  clearPhoto();
                  feedback.selection();
                }}
                onError={setError}
                onSend={() => void send()}
                pending={pending}
                disabled={!!query.error}
                editing={editingId !== null}
              />
            </>
          )}
          <Button variant="ghost" size="sm" className="mt-1" onPress={() => router.dismissTo('/')}>
            <Button.Label>Späť domov</Button.Label>
          </Button>
        </View>
      </View>
      {/* Ponuka po podržaní správy: reakcia, odpoveď, úprava. */}
      <Modal
        visible={!!menuFor}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuFor(null)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
          onPress={() => setMenuFor(null)}
          accessibilityLabel="Zavrieť ponuku"
        >
          <Pressable
            className="bg-surface gap-3 rounded-t-2xl p-5"
            style={{ paddingBottom: Math.max(insets.bottom, 20) }}
            onPress={() => undefined}
          >
            <Txt numberOfLines={2} className="text-muted text-[13px]">
              {menuFor ? snippet(menuFor.body, !!menuFor.image_path) : ''}
            </Txt>
            <View className="flex-row justify-between">
              {REACTIONS.map((emoji) => {
                const current = (query.data?.reactions ?? []).find(
                  (r) => r.messageId === menuFor?.id && r.userId === userId,
                )?.emoji;
                return (
                  <Pressable
                    key={emoji}
                    accessibilityLabel={`Reakcia ${emoji}`}
                    onPress={() => {
                      const target = menuFor;
                      setMenuFor(null);
                      if (!target) return;
                      void react(target.id, current === emoji ? null : emoji)
                        .then(() => {
                          feedback.selection();
                          return query.refresh();
                        })
                        .catch((e: unknown) => {
                          setError(e instanceof Error ? e.message : 'Reakcia sa nepodarila.');
                          feedback.error();
                        });
                    }}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: current === emoji ? palette.yellow : palette.paper,
                    }}
                  >
                    <Txt className="text-[20px]">{emoji}</Txt>
                  </Pressable>
                );
              })}
            </View>
            {menuFor && !isCallMessage(menuFor.body) && (
              <Button
                variant="secondary"
                onPress={() => {
                  setReplyTo(menuFor);
                  setMenuFor(null);
                }}
              >
                <Button.Label>Odpovedať</Button.Label>
              </Button>
            )}
            {menuFor && menuFor.id === newestMineId && (
              <Button
                variant="secondary"
                onPress={() => {
                  const target = menuFor;
                  setMenuFor(null);
                  startEdit(target);
                }}
              >
                <Button.Label>Upraviť správu</Button.Label>
              </Button>
            )}
            <Button variant="ghost" onPress={() => setMenuFor(null)}>
              <Button.Label>Zrušiť</Button.Label>
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

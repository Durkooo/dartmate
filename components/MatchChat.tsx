import { useCallback, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Input } from 'heroui-native';
import * as Crypto from 'expo-crypto';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Empty, Heading, LoadingRows, Txt } from '@/components/DartsUI';
import { OnlineError } from '@/components/OnlineUI';
import { bilt } from '@/lib/bilt';
import { notifyRecipient } from '@/lib/sendPush';
import { feedback } from '@/lib/darts';
import { useOnlineQuery, uuidPattern, timeLabel } from '@/lib/online';
import { playerError, usePlayers } from '@/lib/players';

type MatchChatProps = { userId: string; peerId: string; peerName: string };

export function MatchChat(props: MatchChatProps) {
  return <MatchChatContent key={`${props.userId}:${props.peerId}`} {...props} />;
}

function MatchChatContent({ userId, peerId, peerName }: MatchChatProps) {
  const loader = useCallback(async () => {
    const { data, error } = await bilt
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`,
      )
      .order('id', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  }, [userId, peerId]);
  const query = useOnlineQuery(
    uuidPattern.test(userId) && uuidPattern.test(peerId) ? `match-chat:${userId}:${peerId}` : null,
    loader,
  );
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<React.ComponentRef<typeof Input>>(null);
  const request = useRef<{ body: string; id: string } | null>(null);
  const send = async () => {
    const body = text.trim();
    if (!body || pending) return;
    setPending(true);
    setError('');
    if (request.current?.body !== body) request.current = { body, id: Crypto.randomUUID() };
    try {
      const { data, error: sendError } = await bilt.rpc('send_direct_message', {
        peer: peerId,
        message_body: body,
        client_request: request.current.id,
      });
      if (sendError) throw new Error(sendError.message);
      if (!data?.[0])
        throw new Error('Správu nemožno odoslať. Skontroluj, či ste stále priatelia.');
      if (usePlayers.getState().session?.user.id !== userId) return;
      setText('');
      request.current = null;
      feedback.success();
      const myNickname = usePlayers.getState().profile?.nickname;
      if (myNickname) notifyRecipient(peerId, `@${myNickname}`, body, `/conversation/${userId}`);
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
  return (
    <View className="gap-3">
      <Heading>Chat s {peerName}</Heading>
      <OnlineError error={query.error} retry={() => void query.refresh()} />
      {query.loading ? (
        <LoadingRows />
      ) : (
        <FlatList
          data={query.data ?? []}
          inverted
          nestedScrollEnabled
          style={{ height: 240 }}
          contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <Animated.View
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(100)}
              className="bg-surface rounded-xl p-3"
              style={{
                alignSelf: item.sender_id === userId ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}
            >
              <Txt>{item.body}</Txt>
              <Txt className="text-muted mt-1 text-[11px]">{timeLabel(item.created_at)}</Txt>
            </Animated.View>
          )}
          ListEmptyComponent={
            !query.error ? (
              // Invertovaný zoznam prevráti aj prázdny stav — vrátime ho späť.
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <Empty
                chat
                text="Tu sa zobrazia správy so súperom."
                action="Napísať správu"
                onPress={() => inputRef.current?.focus()}
              />
              </View>
            ) : undefined
          }
        />
      )}
      <Input
        ref={inputRef}
        value={text}
        onChangeText={setText}
        placeholder="Napíš správu…"
        accessibilityLabel="Správa súperovi"
        maxLength={2000}
        editable={!pending}
        multiline
        className="max-h-28"
      />
      {!!error && (
        <Txt className="text-danger" accessibilityRole="alert">
          {error}
        </Txt>
      )}
      <Button isDisabled={pending || !text.trim() || !!query.error} onPress={() => void send()}>
        <Button.Label>{pending ? 'Odosielam…' : 'Odoslať správu'}</Button.Label>
      </Button>
      <Button
        variant="ghost"
        onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: peerId } })}
      >
        <Button.Label>Celá konverzácia</Button.Label>
      </Button>
    </View>
  );
}

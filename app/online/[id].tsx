import { useCallback, useEffect, useState } from 'react';
import { AppState, View, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Button, Input, Label, Switch } from 'heroui-native';
import { Video, Trophy } from 'lucide-react-native';
import { Page, Heading, Txt, Empty, LoadingRows } from '@/components/DartsUI';
import { OnlineGate, OnlineError, Presence, SyncStatus } from '@/components/OnlineUI';
import VideoCall from '@/components/VideoCall';
import { CheckoutDarts } from '@/components/CheckoutDarts';
import { bilt } from '@/lib/bilt';
import { feedback, palette, validScore, canFinish } from '@/lib/darts';
import { playerError, usePlayers } from '@/lib/players';
import {
  appIsActive,
  loadMatch,
  opponentId,
  opponentName,
  respondMatch,
  useOnlineQuery,
} from '@/lib/online';

export default function OnlineGame() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const userId = usePlayers((s) => s.session?.user.id);
  const query = useOnlineQuery(
    userId ? `match:${userId}:${id}` : null,
    useCallback(() => loadMatch(id), [id]),
  );
  const [input, setInput] = useState('');
  const [double, setDouble] = useState(false);
  const [darts, setDarts] = useState<1 | 2 | 3>(3);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [video, setVideo] = useState(false);
  const [abandon, setAbandon] = useState(false);
  const [foreground, setForeground] = useState(appIsActive());
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const m = query.data?.match;
  const [previousTurn, setPreviousTurn] = useState({ turnCount: m?.turn_count, id, userId });
  if (
    previousTurn.turnCount !== m?.turn_count ||
    previousTurn.id !== id ||
    previousTurn.userId !== userId
  ) {
    setPreviousTurn({ turnCount: m?.turn_count, id, userId });
    setInput('');
    setDouble(false);
    setDarts(3);
  }
  useEffect(() => {
    const change = () => setForeground(appIsActive());
    const sub = AppState.addEventListener('change', change);
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', change);
    return () => {
      sub.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', change);
    };
  }, []);
  const respond = async (decision: 'accept' | 'decline' | 'cancel' | 'abandon') => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await respondMatch(id, decision);
      await query.refresh();
      feedback.success();
      setAbandon(false);
    } catch (e) {
      setError(
        playerError({
          message: e instanceof Error ? e.message : 'Zápas sa nepodarilo aktualizovať.',
        }),
      );
      feedback.error();
      await query.refresh();
    } finally {
      setPending(false);
    }
  };
  const submit = async () => {
    if (!m || pending) return;
    const score = Number(input);
    if (!input || !/^\d{1,3}$/.test(input) || !validScore(score)) {
      setError('Zadaj možné skóre od 0 do 180.');
      feedback.error();
      return;
    }
    setPending(true);
    setError('');
    try {
      const { data, error: e } = await bilt.rpc('submit_online_turn', {
        mid: id,
        expected_turn: m.turn_count,
        turn_score: score,
        finished_double: double,
        darts_thrown: darts,
      });
      if (e) throw new Error(e.message);
      if (!data?.[0])
        throw new Error('Ťah sa nezapísal. Skontroluj skóre, počet šípok a kto je na ťahu.');
      await query.refresh();
      setInput('');
      setDouble(false);
      setDarts(3);
      feedback.success();
    } catch (e) {
      setError(
        playerError({ message: e instanceof Error ? e.message : 'Skóre sa nepodarilo odoslať.' }),
      );
      feedback.error();
      await query.refresh();
    } finally {
      setPending(false);
    }
  };
  if (!userId)
    return (
      <Page fallbackHref="/online" fallbackLabel="Späť na online zápasy">
        <OnlineGate>{null}</OnlineGate>
      </Page>
    );
  if (query.loading)
    return (
      <Page fallbackHref="/online">
        <LoadingRows />
      </Page>
    );
  if (!m)
    return (
      <Page fallbackHref="/online" fallbackLabel="Späť na online zápasy">
        <OnlineError error={query.error} retry={() => void query.refresh()} />
        {!query.error && (
          <Empty
            text="Zápas nie je dostupný pre tento účet."
            action="Online zápasy"
            onPress={() => router.replace('/online')}
          />
        )}
      </Page>
    );
  const host = m.host_id === userId;
  const myRemaining = host ? m.host_remaining : m.guest_remaining;
  const peerRemaining = host ? m.guest_remaining : m.host_remaining;
  const peerName = opponentName(m, userId);
  const contact = query.data?.contacts.find((c) => c.user_id === opponentId(m, userId));
  const mine = m.next_player === userId && m.status === 'active';
  const checkout =
    !!input &&
    Number(input) === myRemaining &&
    canFinish(Number(input), m.double_out) &&
    (!m.double_out || double);
  const showDouble =
    !!input && Number(input) === myRemaining && m.double_out && canFinish(Number(input), true);
  const disabled = pending || !!query.error || !mine;
  return (
    <KeyboardAvoidingView
      className="bg-background flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={query.data?.turns ?? []}
        keyExtractor={(t) => String(t.turn_number)}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 32,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View className="flex-row items-center justify-between gap-3">
              <Txt className="flex-1" style={{ fontFamily: 'Inter_600SemiBold' }}>
                {m.starting} · {m.double_out ? 'Double out' : 'Straight out'}
              </Txt>
              <Presence online={!!contact?.online} unknown={!!query.error || !contact} />
            </View>
            <SyncStatus error={query.error} syncedAt={query.syncedAt} />
            <OnlineError error={query.error} retry={() => void query.refresh()} />
            <View className="bg-ink overflow-hidden rounded-[22px]">
              <View className="flex-row p-4">
                {[
                  { name: 'Ty', score: myRemaining, active: mine },
                  {
                    name: `@${peerName}`,
                    score: peerRemaining,
                    active: !mine && m.status === 'active',
                  },
                ].map((p) => (
                  <View key={p.name} className="flex-1 items-center px-2">
                    <Txt className="text-on-ink text-[14px]" numberOfLines={1}>
                      {p.name}
                    </Txt>
                    <Txt
                      className={
                        p.active
                          ? 'text-accent text-[54px] leading-[66px]'
                          : 'text-[54px] leading-[66px] text-white'
                      }
                      adjustsFontSizeToFit
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                      style={{
                        fontFamily: 'Inter_700Bold',
                        fontVariant: ['tabular-nums'],
                        letterSpacing: -3,
                      }}
                    >
                      {p.score}
                    </Txt>
                  </View>
                ))}
              </View>
              <View className="bg-accent px-4 py-3">
                <Txt
                  className="text-center text-[13px]"
                  style={{ fontFamily: 'Inter_600SemiBold' }}
                >
                  {m.status === 'invited'
                    ? 'Čaká na prijatie'
                    : m.status === 'finished'
                      ? m.winner_id === userId
                        ? 'Vyhral si!'
                        : `@${peerName} vyhráva!`
                      : m.status === 'active'
                        ? mine
                          ? 'Si na ťahu'
                          : `Na ťahu: @${peerName}`
                        : m.status === 'declined'
                          ? 'Pozvánka odmietnutá'
                          : 'Zápas zrušený'}
                </Txt>
              </View>
            </View>
            {m.status === 'invited' && (
              <View className="mt-5 gap-3">
                <Heading className="text-[20px]">
                  {host ? 'Pozvánka odoslaná' : `@${peerName} ťa pozýva`}
                </Heading>
                {host ? (
                  <Button
                    variant="secondary"
                    isDisabled={pending || !!query.error}
                    onPress={() => void respond('cancel')}
                  >
                    <Button.Label>{pending ? 'Čakaj…' : 'Zrušiť pozvánku'}</Button.Label>
                  </Button>
                ) : (
                  <>
                    <Button
                      isDisabled={pending || !!query.error}
                      onPress={() => void respond('accept')}
                    >
                      <Button.Label>{pending ? 'Prijímam…' : 'Prijať zápas'}</Button.Label>
                    </Button>
                    <Button
                      variant="ghost"
                      isDisabled={pending || !!query.error}
                      onPress={() => void respond('decline')}
                    >
                      <Button.Label>Teraz nie</Button.Label>
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  onPress={() =>
                    router.push({
                      pathname: '/conversation/[id]',
                      params: { id: opponentId(m, userId) },
                    })
                  }
                >
                  <Button.Label>Napísať súperovi</Button.Label>
                </Button>
              </View>
            )}
            {m.status === 'active' && (
              <View className="mt-5 gap-4">
                <Button
                  variant="secondary"
                  onPress={() => {
                    setVideo((v) => !v);
                    feedback.selection();
                  }}
                >
                  <Video size={19} strokeWidth={1.8} color={palette.ink} />
                  <Button.Label>
                    {video ? 'Odpojiť videohovor' : 'Pripojiť videohovor'}
                  </Button.Label>
                </Button>
                {video && focused && foreground && (
                  <VideoCall matchId={id} onLeave={() => setVideo(false)} />
                )}
                <Txt className="text-muted text-[13px]">
                  {mine
                    ? 'Zapisuješ iba svoje hody. Odoslaný ťah už nemožno meniť.'
                    : 'Čakáš na súperov ťah. Hra zostane uložená aj po odchode.'}
                </Txt>
                {mine && (
                  <>
                    <View>
                      <Label>Súčet 3 šípok</Label>
                      <Input
                        value={input}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        maxLength={3}
                        editable={!disabled}
                        onChangeText={(v) => {
                          setInput(v.replace(/\D/g, ''));
                          setDouble(false);
                          setDarts(3);
                          setError('');
                        }}
                        placeholder="0 až 180"
                        accessibilityLabel="Skóre ťahu"
                        className="mt-2"
                      />
                    </View>
                    <View className="flex-row gap-2">
                      {[26, 60, 100, 180].map((n) => (
                        <Button
                          key={n}
                          variant="secondary"
                          className="flex-1"
                          size="sm"
                          isDisabled={disabled}
                          onPress={() => {
                            setInput(String(n));
                            setDouble(false);
                            setDarts(3);
                            feedback.selection();
                          }}
                        >
                          <Button.Label>{n}</Button.Label>
                        </Button>
                      ))}
                    </View>
                    {(showDouble || checkout) && (
                      <View className="gap-4">
                        {m.double_out && (
                          <View className="flex-row items-center justify-between gap-3">
                            <Txt className="flex-1">Posledná šípka bola double</Txt>
                            <Switch
                              isSelected={double}
                              isDisabled={disabled}
                              onSelectedChange={(v) => {
                                setDouble(v);
                                setDarts(3);
                                feedback.selection();
                              }}
                            />
                          </View>
                        )}
                        {checkout && (
                          <CheckoutDarts value={darts} onChange={setDarts} disabled={disabled} />
                        )}
                      </View>
                    )}
                    <Button isDisabled={disabled || !input} onPress={() => void submit()}>
                      <Button.Label>{pending ? 'Odosielam…' : 'Potvrdiť skóre'}</Button.Label>
                    </Button>
                  </>
                )}
                {abandon ? (
                  <View className="gap-3">
                    <Txt>Zrušiť zápas pre oboch hráčov? Nebude sa počítať do štatistík.</Txt>
                    <Button
                      variant="danger"
                      isDisabled={pending || !!query.error}
                      onPress={() => void respond('abandon')}
                    >
                      <Button.Label>Zrušiť zápas</Button.Label>
                    </Button>
                    <Button variant="ghost" isDisabled={pending} onPress={() => setAbandon(false)}>
                      <Button.Label>Pokračovať</Button.Label>
                    </Button>
                  </View>
                ) : (
                  <Button variant="ghost" onPress={() => setAbandon(true)}>
                    <Button.Label>Zrušiť rozhraný zápas</Button.Label>
                  </Button>
                )}
              </View>
            )}
            {m.status === 'finished' && (
              <View className="items-center gap-3 py-6">
                <Trophy size={32} strokeWidth={1.8} color={palette.ink} />
                <Txt>Výsledok a štatistiky sú uložené.</Txt>
                <Button onPress={() => router.push('/statistics')}>
                  <Button.Label>Moje štatistiky</Button.Label>
                </Button>
              </View>
            )}
            {!!error && (
              <Txt className="text-danger mt-4" accessibilityRole="alert">
                {error}
              </Txt>
            )}
            <Heading className="mt-7 mb-3 text-[20px]">Ťahy</Heading>
          </View>
        }
        renderItem={({ item }) => (
          <View className="border-border flex-row justify-between gap-3 border-b py-3">
            <View className="flex-1">
              <Txt numberOfLines={1}>{item.player_id === userId ? 'Ty' : `@${peerName}`}</Txt>
              <Txt className="text-muted text-[12px]">
                Ťah {item.turn_number} · {item.darts} {item.darts === 1 ? 'šípka' : 'šípky'}
              </Txt>
            </View>
            <Txt
              style={{ fontFamily: 'Inter_600SemiBold' }}
              className={item.bust ? 'text-danger' : ''}
            >
              {item.bust ? 'Prehodené' : item.score} → {item.remaining}
            </Txt>
          </View>
        )}
        ListEmptyComponent={<Txt className="text-muted py-4 text-[13px]">Zatiaľ bez hodov.</Txt>}
        ListFooterComponent={
          <Button variant="ghost" className="mt-4" onPress={() => router.dismissTo('/online')}>
            <Button.Label>Späť na online zápasy</Button.Label>
          </Button>
        }
      />
    </KeyboardAvoidingView>
  );
}

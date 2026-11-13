import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { AppState, View, ScrollView, KeyboardAvoidingView, Modal, Platform } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Button } from 'heroui-native';
import { Video, Trophy } from 'lucide-react-native';
import { Page, Heading, Txt, Empty, LoadingRows } from '@/components/DartsUI';
import { OnlineGate, OnlineError } from '@/components/OnlineUI';
import VideoCall from '@/components/VideoCall';
import { NumberPad } from '@/components/NumberPad';
import { MatchChat } from '@/components/MatchChat';
import { bilt } from '@/lib/bilt';
import { feedback, palette, validScore, canFinish, validCheckout, topScores } from '@/lib/darts';
import { playerError, usePlayers } from '@/lib/players';
import { loadCameraPrefs, warmUpCamera, type CameraPrefs } from '@/lib/video';
import { ShareResult } from '@/components/ShareResult';
import { onlineMatchShare } from '@/lib/shareGame';
import {
  appIsActive,
  loadMatch,
  opponentId,
  opponentName,
  respondMatch,
  undoOnlineTurn,
  useOnlineQuery,
  type OnlineTurn,
} from '@/lib/online';

export default function OnlineGame() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const userId = usePlayers((s) => s.session?.user.id);
  const myNick = usePlayers((s) => s.profile?.nickname);
  const query = useOnlineQuery(
    userId ? `match:${userId}:${id}` : null,
    useCallback(() => loadMatch(id), [id]),
  );
  // VŠETKY háky musia byť pred prvým podmieneným returnom (stabilný počet).
  // Zamietnutá/zrušená pozvánka: vrátime sa do správ s tým človekom.
  const watchedStatus = query.data?.match?.status;
  const watchedPeer = query.data?.match && userId ? opponentId(query.data.match, userId) : '';
  useEffect(() => {
    if ((watchedStatus === 'declined' || watchedStatus === 'cancelled') && watchedPeer) {
      const t = setTimeout(() => {
        router.replace({ pathname: '/conversation/[id]', params: { id: watchedPeer } });
      }, 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [watchedStatus, watchedPeer]);
  const videoRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const watchedTurnCount = query.data?.match?.turn_count ?? 0;
  // Po prestriedaní ťahu vyrolovať stránku čo najvyššie,
  // aby bolo skóre vidno pre oboch hráčov.
  useEffect(() => {
    // Zámerne sa spúšťa pri zmene počtu ťahov — po prestriedaní vyroluje stránku hore.
    if (watchedTurnCount === 0) return;
    videoRef.current?.scrollTo({ y: 0, animated: true });
  }, [watchedTurnCount]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [video, setVideo] = useState(false);
  // Vyskakovacie okno s kamerou: otvorí sa samo pri zmene ťahu na súpera;
  // „Skryť“ vydrží do ďalšieho ťahu, kuk (peek) ho otvorí aj v mojom ťahu.
  const [camHiddenTurn, setCamHiddenTurn] = useState<string | null>(null);
  const [camPeek, setCamPeek] = useState(false);
  // Stav mikrofónu si pamätáme po celý zápas: raz vypnutý = vypnutý,
  // kým ho hráč v tomto zápase znova nezapne. Platí od prvého pripojenia.
  const [micWanted, setMicWanted] = useState(true);
  const [camPrefs, setCamPrefs] = useState<CameraPrefs>({ match: 'environment', call: 'user' });
  useEffect(() => {
    void loadCameraPrefs().then(setCamPrefs);
  }, []);
  const [abandon, setAbandon] = useState(false);
  const [showTurns, setShowTurns] = useState(false);
  // Keep undo snapshots scoped to the match, even while authentication is loading.
  const [voided, setVoided] = useState<OnlineTurn[]>([]);
  const [voidedMatch, setVoidedMatch] = useState('');
  if (voidedMatch !== id) {
    setVoidedMatch(id);
    setVoided([]);
  }
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

  /** Šípka pri prázdnom vstupe: vráti môj posledný ťah (ak súper ešte nehodil). */
  const undoTurn = async () => {
    if (!m || pending || !mine) return;
    // Snímka najnovších ťahov pred vrátením — ktoré zmiznú, tie ukážeme prečiarknuté.
    const before = turns.slice(0, 2);
    setPending(true);
    setError('');
    try {
      await undoOnlineTurn(id);
      await query.refresh();
      setVoided((v) => {
        const keys = new Set(v.map((t) => `${t.leg_number}:${t.turn_number}`));
        return [...before.filter((t) => !keys.has(`${t.leg_number}:${t.turn_number}`)), ...v];
      });
      setInput('');
      feedback.success();
    } catch (e) {
      setError(
        playerError({ message: e instanceof Error ? e.message : 'Ťah sa nepodarilo vrátiť.' }),
      );
      feedback.error();
      await query.refresh();
    } finally {
      setPending(false);
    }
  };

  /** Odoslanie ťahu. Pri zatváraní legu (skóre 0) volá hráč s počtom šípok 1/2/3.
      S presetom rovno započíta konkrétnu skratku bez potvrdzovania. */
  const submitWith = async (chosenDarts: 1 | 2 | 3, preset?: number) => {
    if (!m || pending) return;
    const score = preset ?? Number(input);
    if ((preset === undefined && (!input || !/^\d{1,3}$/.test(input))) || !validScore(score)) {
      setError('Zadaj možné skóre od 0 do 180.');
      feedback.error();
      return;
    }
    const closing =
      preset === undefined ? checkout : score === myRemaining && canFinish(score, m.double_out);
    setPending(true);
    setError('');
    try {
      const { data, error: e } = await bilt.rpc('submit_online_turn', {
        mid: id,
        expected_turn: m.turn_count,
        turn_score: score,
        finished_double: closing,
        darts_thrown: chosenDarts,
      });
      if (e) throw new Error(e.message);
      if (!data?.[0])
        throw new Error('Ťah sa nezapísal. Skontroluj skóre, počet šípok a kto je na ťahu.');
      await query.refresh();
      setInput('');
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

  /** Skratka častého čísla: rovno započíta bez potvrdzovania (predvoľba 3 šípky).
      Ak by zatvorenie chcelo menej šípok, len predvyplní a hráč zvolí počet. */
  const quickSubmit = (n: number) => {
    if (!m || pending || !mine) return;
    const isCheckout = n === myRemaining && canFinish(n, m.double_out);
    if (isCheckout && !validCheckout(n, 3, m.double_out)) {
      setInput(String(n));
      setError('');
      feedback.selection();
      return;
    }
    void submitWith(3, n);
  };

  if (!userId)
    return (
      <Page fallbackHref="/online" fallbackLabel="Späť na online zápasy">
        <OnlineGate>{null}</OnlineGate>
      </Page>
    );
  const host = m?.host_id === userId;
  const myRemaining = host ? (m?.host_remaining ?? 0) : (m?.guest_remaining ?? 0);
  const peerRemaining = host ? (m?.guest_remaining ?? 0) : (m?.host_remaining ?? 0);
  const peerName = m && userId ? opponentName(m, userId) : '';
  const peerId = m && userId ? opponentId(m, userId) : '';
  const myName = host ? (m?.host_nickname ?? '') : (m?.guest_nickname ?? '');
  const legsToWin = m?.legs_to_win ?? 1;
  const myLegs = host ? (m?.host_legs ?? 0) : (m?.guest_legs ?? 0);
  const peerLegs = host ? (m?.guest_legs ?? 0) : (m?.host_legs ?? 0);
  const legNo = myLegs + peerLegs + 1;
  // Začínajúceho legu striedame rovnako ako server: párny leg host, nepárny guest.
  const completedLegs = myLegs + peerLegs;
  const starterIsHost = completedLegs % 2 === 0;
  const legStarterName = (starterIsHost === host ? myName : peerName) || peerName;
  const contact = query.data?.contacts.find((c: any) => c.user_id === peerId);
  const mine = !!m && m.next_player === userId && m.status === 'active';
  const checkout =
    !!input && Number(input) === myRemaining && canFinish(Number(input), m.double_out);
  const contactOnline = !!contact?.online && !query.error;
  const disabled = pending || !!query.error || !mine;
  const turns = query.data?.turns ?? [];
  // Vrátené ťahy server zmaže — na zobrazenie prečiarknutých si držíme ich snímky.
  // Vidno len tie, ktoré server medzitým nenahradil novým hodom (rovnaké leg + číslo).
  const extraVoided = voided.filter(
    (v) => !turns.some((t) => t.leg_number === v.leg_number && t.turn_number === v.turn_number),
  );
  const voidedKeys = new Set(extraVoided.map((v) => `${v.leg_number}:${v.turn_number}`));
  const shownTurns = [...turns, ...extraVoided].sort(
    (a, b) => b.leg_number - a.leg_number || b.turn_number - a.turn_number,
  );
  // Najčastejšie súčty mojich hodov v tomto zápase (bez prehodených) — rýchle tipy nad klávesnicu.
  const frequent = topScores(
    turns.filter((t) => t.player_id === userId && !t.bust).map((t) => t.score),
  );
  // Čakám na súpera → jeho video veľké; inak (hádžem) kompaktné počítadlo
  // + malé video pod číselníkom. Poradie vždy: skóre → číselník → video → chat.
  const waiting = !!m && m.status === 'active' && !mine;
  const videoVisible = video && !!m && m.status === 'active' && focused && foreground;
  const turnId = m ? `${m.id}:${m.next_player}` : '';
  const popupOpen = videoVisible && (camPeek || (waiting && camHiddenTurn !== turnId));
  const closeCamPopup = () => {
    if (waiting) setCamHiddenTurn(turnId);
    setCamPeek(false);
  };
  const openCamPopup = () => {
    setCamHiddenTurn(null);
    setCamPeek(true);
  };

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

  return (
    <KeyboardAvoidingView
      className="bg-background flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={videoRef}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 32,
          gap: 12,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1) SKÓRE – vždy na vrchu */}
        <View className="bg-ink overflow-hidden rounded-[22px]">
          {legsToWin > 1 && (
            <View className="flex-row items-center justify-center gap-2 px-4 pt-1">
              <Trophy size={14} strokeWidth={1.8} color={palette.ink} />
              <Txt className="text-on-ink text-[12px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
                {m?.status === 'finished'
                  ? `Legy ${myLegs}:${peerLegs}`
                  : `Leg ${legNo} · legy ${myLegs}:${peerLegs} (do ${legsToWin}) · začína @${legStarterName}`}
              </Txt>
            </View>
          )}
          <View className="flex-row px-4 py-1">
            {[
              { key: 'me', name: `@${myName}`, score: myRemaining, active: mine },
              {
                key: 'peer',
                name: `@${peerName}`,
                score: peerRemaining,
                active: !mine && m.status === 'active',
              },
            ].map((p) => (
              <View key={p.key} className="flex-1 items-center px-2">
                <View className="flex-row items-center gap-1.5">
                  <View
                    style={{
                      backgroundColor:
                        p.key === 'peer'
                          ? contactOnline
                            ? palette.success
                            : palette.danger
                          : 'transparent',
                      width: 7,
                      height: 7,
                      borderRadius: 3.5,
                    }}
                  />
                  <Txt className="text-on-ink text-[13px]" numberOfLines={1}>
                    {p.name}
                  </Txt>
                </View>
                <Txt
                  className={
                    p.active
                      ? 'text-accent text-[30px] leading-[38px]'
                      : 'text-[30px] leading-[38px] text-white'
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
        </View>

        {/* Status / chyby spojenia pod skóre (kompaktné, bez času) */}
        <OnlineError error={query.error} retry={() => void query.refresh()} />

        {/* 2) KLÁVESNICA pod skóre – len keď hádžem (mine).
            Čakajúcemu sa klávesnica schová a na jej mieste je video.
            (Klávesnica mimo ťahu je aj tak neaktívna, len by zavadzala.) */}
        {m.status === 'active' && mine && (
          <View className="gap-4">
            {frequent.length > 0 && (
              <View className="flex-row gap-2">
                {frequent.map((n) => (
                  <Button
                    key={n}
                    variant="secondary"
                    size="sm"
                    className="flex-1 rounded-lg"
                    onPress={() => quickSubmit(n)}
                  >
                    <Button.Label>{n}</Button.Label>
                  </Button>
                ))}
              </View>
            )}
            <NumberPad
              value={input}
              onChange={(v) => {
                setInput(v);
                setError('');
              }}
              onSubmit={() => void submitWith(3)}
              onUndoTurn={() => void undoTurn()}
              disabled={disabled}
              pending={pending}
            />

            {mine && checkout && (
              <View className="gap-4">
                {checkout ? (
                  <View className="bg-surface gap-3 rounded-2xl p-4">
                    <Txt className="text-center" style={{ fontFamily: 'Inter_600SemiBold' }}>
                      Zavrel si leg {Number(input)}! Koľkými šípkami?
                    </Txt>
                    <View className="flex-row gap-2">
                      {([1, 2, 3] as const).map((n) => {
                        const ok = validCheckout(Number(input), n, m.double_out);
                        return (
                          <Button
                            key={n}
                            className="h-14 flex-1 rounded-xl"
                            variant="primary"
                            isDisabled={disabled || !ok}
                            onPress={() => void submitWith(n)}
                          >
                            <Button.Label
                              className="text-[24px]"
                              style={{ fontFamily: 'Inter_700Bold' }}
                            >
                              {n}
                            </Button.Label>
                          </Button>
                        );
                      })}
                    </View>
                    <Txt className="text-muted text-center text-[12px]">
                      Kliknutím na číslo sa leg ukončí.
                    </Txt>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        )}

        {/* 3) KAMERA SÚPERA – vyskakovacie okno, keď nie som na ťahu.
            VideoCall je pripojený RAZ a nikdy sa neodmontúva (inak by sa po každom
            hode znova pripájal = 5 s delay + reset kamery/miku).
            Native = skutočný Modal (skrytý ostáva pripojený).
            Web = ten istý obsah vložený priamo (webový Modal by video odmontoval).
            Pri výmene ťahu sa okno a klávesnica prehodia samé na oboch telefónoch. */}
        {videoVisible &&
          (Platform.OS === 'web' ? (
            popupOpen ? (
              <View>
                {/* mini skóre v okne */}
                <View className="bg-ink mb-3 overflow-hidden rounded-[22px]">
                  <View className="flex-row items-center justify-center px-4 py-2">
                    <Txt
                      className="text-on-ink text-[13px]"
                      style={{ fontFamily: 'Inter_600SemiBold' }}
                    >
                      Ty {myRemaining} : {peerRemaining} @{peerName}
                      {legsToWin > 1 ? ` · leg ${legNo} (${myLegs}:${peerLegs})` : ''}
                    </Txt>
                  </View>
                </View>
                <VideoCall
                  matchId={id}
                  onLeave={() => setVideo(false)}
                  large
                  micWanted={micWanted}
                  onMicChange={setMicWanted}
                  peerName={peerName}
                  initialFacing={camPrefs.match}
                  initialDeviceId={camPrefs.matchDeviceId}
                />
                <Button variant="secondary" className="mt-3" onPress={closeCamPopup}>
                  <Button.Label>Skryť kameru</Button.Label>
                </Button>
              </View>
            ) : (
              <Button variant="secondary" onPress={openCamPopup}>
                <Button.Label>📹 Kamera súpera</Button.Label>
              </Button>
            )
          ) : (
            <>
              {!popupOpen && (
                <Button variant="secondary" onPress={openCamPopup}>
                  <Button.Label>📹 Kamera súpera</Button.Label>
                </Button>
              )}
              <Modal visible={popupOpen} animationType="slide" onRequestClose={closeCamPopup}>
                <View className="bg-background flex-1">
                  <ScrollView
                    contentContainerStyle={{
                      padding: 16,
                      paddingBottom: 32,
                      gap: 12,
                      maxWidth: 600,
                      width: '100%',
                      alignSelf: 'center',
                    }}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View className="bg-ink overflow-hidden rounded-[22px]">
                      <View className="flex-row items-center justify-center px-4 py-2">
                        <Txt
                          className="text-on-ink text-[13px]"
                          style={{ fontFamily: 'Inter_600SemiBold' }}
                        >
                          Ty {myRemaining} : {peerRemaining} @{peerName}
                          {legsToWin > 1 ? ` · leg ${legNo} (${myLegs}:${peerLegs})` : ''}
                        </Txt>
                      </View>
                    </View>
                    <VideoCall
                      matchId={id}
                      onLeave={() => setVideo(false)}
                      large
                      micWanted={micWanted}
                      onMicChange={setMicWanted}
                      peerName={peerName}
                      initialFacing={camPrefs.match}
                      initialDeviceId={camPrefs.matchDeviceId}
                    />
                    <Button variant="secondary" onPress={closeCamPopup}>
                      <Button.Label>Skryť kameru</Button.Label>
                    </Button>
                  </ScrollView>
                </View>
              </Modal>
            </>
          ))}

        {/* Tlačidlo kamery (schová sa pri zapnutej kamere –
            ovládanie je priamo vo video paneli) */}
        {m.status === 'active' && !video && (
          <Button
            variant="secondary"
            onPress={() => {
              // Povolenie kamery musí prísť z gesta — predhrejeme ju ešte pred videom.
              void warmUpCamera(camPrefs.match, camPrefs.matchDeviceId).catch(() => undefined);
              setVideo(true);
              feedback.selection();
            }}
          >
            <Video size={19} strokeWidth={1.8} color={palette.ink} />
            <Button.Label>Zapnúť kameru na terč</Button.Label>
          </Button>
        )}

        {/* 2b) POZVÁNKA */}
        {m.status === 'invited' && (
          <View className="gap-3">
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
          </View>
        )}

        {m.status === 'declined' || m.status === 'cancelled' ? (
          <View className="gap-3">
            <Heading className="text-[20px]">
              {m.status === 'declined'
                ? host
                  ? 'Súper pozvánku odmietol.'
                  : 'Odmietol si pozvánku.'
                : host
                  ? 'Pozvánku si zrušil.'
                  : 'Súper pozvánku zrušil.'}
            </Heading>
            <Txt className="text-muted text-[13px]">O chvíľu ťa vrátim do správ…</Txt>
            <Button
              onPress={() =>
                router.replace({ pathname: '/conversation/[id]', params: { id: peerId } })
              }
            >
              <Button.Label>Späť do správ</Button.Label>
            </Button>
          </View>
        ) : null}

        {m.status === 'finished' && (
          <View className="items-center gap-3 py-4">
            <Trophy size={32} strokeWidth={1.8} color={palette.ink} />
            <Txt>Výsledok a štatistiky sú uložené.</Txt>
            {!!userId && !!myNick && (
              <ShareResult {...onlineMatchShare(m, turns, userId, myNick)} />
            )}
            <Button onPress={() => router.push('/statistics')}>
              <Button.Label>Moje štatistiky</Button.Label>
            </Button>
          </View>
        )}

        {!!error && (
          <Txt className="text-danger" accessibilityRole="alert">
            {error}
          </Txt>
        )}

        {/* 3) CHAT */}
        <MatchChat userId={userId} peerId={peerId} peerName={peerName} />

        {/* História ťahov (zbaliteľná) */}
        <Button variant="ghost" onPress={() => setShowTurns((s) => !s)}>
          <Button.Label>
            {showTurns ? 'Skryť ťahy' : `Zobraziť ťahy (${shownTurns.length})`}
          </Button.Label>
        </Button>
        {showTurns &&
          (shownTurns.length === 0 ? (
            <Txt className="text-muted text-[13px]">Zatiaľ bez hodov.</Txt>
          ) : (
            shownTurns.map((item) => {
              const voidedTurn = voidedKeys.has(`${item.leg_number}:${item.turn_number}`);
              return (
                <View
                  key={item.turn_number}
                  className="border-border flex-row justify-between gap-3 border-b py-2"
                >
                  <View className="flex-1">
                    <Txt numberOfLines={1}>{item.player_id === userId ? 'Ty' : `@${peerName}`}</Txt>
                    <Txt className="text-muted text-[12px]">
                      Ťah {item.turn_number} · {item.darts} {item.darts === 1 ? 'šípka' : 'šípky'}
                    </Txt>
                  </View>
                  <Txt
                    style={{
                      fontFamily: 'Inter_600SemiBold',
                      textDecorationLine: voidedTurn ? 'line-through' : 'none',
                    }}
                    className={
                      item.bust && !voidedTurn ? 'text-danger' : voidedTurn ? 'text-muted' : ''
                    }
                  >
                    {item.bust && !voidedTurn ? 'Prehodené' : item.score} → {item.remaining}
                  </Txt>
                </View>
              );
            })
          ))}

        {m.status === 'active' &&
          (abandon ? (
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
          ))}

        <Button variant="ghost" onPress={() => router.dismissTo('/')}>
          <Button.Label>Späť domov</Button.Label>
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

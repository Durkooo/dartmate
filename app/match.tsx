import { useCallback, useState } from 'react';
import { View, FlatList } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Button, Spinner } from 'heroui-native';
import { Delete, Undo2, Check, Trophy, RotateCcw } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Txt, Heading, Empty, StorageNotice, LoadingRows } from '@/components/DartsUI';
import { ScoreStrip } from '@/components/GameBoard';
import { generateBotTurn } from '@/lib/bots';
import { ShareResult } from '@/components/ShareResult';
import { localGameShare } from '@/lib/shareGame';
import { usePlayers } from '@/lib/players';
import { VoiceScore } from '@/components/VoiceScore';
import { clickById, useHardwareKeyboard, useInputSettings, useVoiceMode } from '@/lib/scoreInput';
import {
  palette,
  feedback,
  useDarts,
  scores,
  activePlayer,
  average,
  validScore,
  canFinish,
  validCheckout,
  currentLeg,
  topScores,
} from '@/lib/darts';

export default function Match() {
  const game = useDarts((s) => s.game);
  const friends = usePlayers((s) => s.friends);
  const myNick = usePlayers((s) => s.profile?.nickname);
  // Meno majiteľa účtu (bez prihlásenia „Ty“).
  const me = myNick || 'Ty';
  const hydrated = useDarts((s) => s.hydrated);
  const submitTurn = useDarts((s) => s.submitTurn);
  const undo = useDarts((s) => s.undo);
  const startNextLeg = useDarts((s) => s.startNextLeg);
  const archiveGame = useDarts((s) => s.archiveGame);
  const startGame = useDarts((s) => s.startGame);
  const discardGame = useDarts((s) => s.discardGame);
  const history = useDarts((s) => s.history);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const botTurn =
    !!game?.bot && game.winner === null && !game.betweenLegs && activePlayer(game) === 1;
  // Hlásenie skóre hlasom (ostáva zapnuté počas celého zápasu) a Bluetooth klávesnica.
  const [voiceOn, setVoiceOn] = useVoiceMode(`offline:${game?.id ?? ''}`);
  const hardwareKeyboard = useInputSettings((s) => s.hardwareKeyboard);
  useHardwareKeyboard(
    hardwareKeyboard && !!game && game.winner === null && !game.betweenLegs && !botTurn,
    {
      digit: (d) => {
        setInput((prev) => (prev.length >= 3 ? prev : prev === '0' ? d : prev + d));
        setError('');
      },
      backspace: () => setInput((prev) => prev.slice(0, -1)),
      clear: () => setInput(''),
      // Enter = ťuknutie na „Zapísať“ (rovnaké kontroly ako pri ťuknutí).
      enter: () => clickById('score-submit'),
    },
  );
  useFocusEffect(
    useCallback(() => {
      if (!hydrated || !game || !botTurn || discard) return undefined;
      const timer = setTimeout(() => {
        const current = useDarts.getState().game;
        if (
          !current ||
          current !== game ||
          current.winner !== null ||
          current.betweenLegs ||
          activePlayer(current) !== 1
        )
          return;
        const turn = generateBotTurn(current);
        submitTurn(turn.score, turn.checkout, turn.darts);
        feedback.success();
      }, 1100);
      return () => clearTimeout(timer);
    }, [hydrated, game, botTurn, discard, submitTurn]),
  );
  if (!hydrated)
    return (
      <View className="bg-background flex-1 p-5">
        <LoadingRows />
      </View>
    );
  if (!game)
    return (
      <View className="bg-background flex-1 p-5">
        <Stack.Screen options={{ title: 'Zápas' }} />
        <Empty
          text="Terč čaká na prvý zápas."
          action="Nový zápas"
          onPress={() => router.replace('/new-match')}
        />
        <Button variant="ghost" onPress={() => router.replace('/')}>
          <Button.Label>Späť domov</Button.Label>
        </Button>
      </View>
    );
  const currentScores = scores(game);
  const player = activePlayer(game);
  const opponentFirst = game.bot ? game.opponentName : game.opponentName.split(' ')[0];
  const practice = game.opponentId === 'practice';
  // Najčastejšie súčty hádžuceho hráča (história + tento zápas, bez prehodených).
  const frequent = topScores([
    ...history.flatMap((g) =>
      g.solo && player !== 0
        ? []
        : (g.turns ?? [])
            .filter((t) => t.player === player && !t.bust && !t.undone)
            .map((t) => t.score),
    ),
    ...game.turns.filter((t) => t.player === player && !t.bust && !t.undone).map((t) => t.score),
  ]);
  const score = Number(input);
  const checkout =
    !!input &&
    score === currentScores[player] &&
    validScore(score) &&
    canFinish(score, game.doubleOut);
  const finished = game.winner !== null;
  const legBreak = game.betweenLegs;
  const legNo = currentLeg(game) + 1;
  const legWinnerName = (() => {
    if (!legBreak) return '';
    const last = game.turns.at(-1);
    if (!last) return '';
    return last.player === 0 ? me : practice ? 'Hráč 2' : opponentFirst;
  })();
  const append = (digit: string) => {
    if (input.length >= 3) return;
    setInput(input === '0' ? digit : input + digit);
    setError('');
    feedback.selection();
  };
  /** Uloženie ťahu. Pri zatváraní hry (skóre 0) volá hráč s počtom šípok 1/2/3.
      S presetom rovno započíta konkrétnu skratku bez potvrdzovania. */
  const saveWith = (chosenDarts: 1 | 2 | 3, preset?: number) => {
    if (botTurn) return;
    const value = preset ?? score;
    if ((preset === undefined && !input) || !validScore(value)) {
      setError('Zadaj možné skóre troch šípok od 0 do 180.');
      feedback.error();
      return;
    }
    const closing =
      preset === undefined
        ? checkout
        : value === currentScores[player] && canFinish(value, game.doubleOut);
    if (closing && !validCheckout(value, chosenDarts, game.doubleOut)) {
      setError('Toto skóre nemožno zatvoriť zvoleným počtom šípok. Skontroluj výber.');
      feedback.error();
      return;
    }
    submitTurn(value, closing, closing ? chosenDarts : 3);
    setInput('');
    setError('');
    if (useDarts.getState().game?.turns.at(-1)?.bust) feedback.error();
    else feedback.success();
  };
  /** Skratka častého čísla: rovno započíta bez potvrdzovania (predvoľba 3 šípky).
      Ak by zatvorenie chcelo menej šípok, len predvyplní a hráč zvolí počet. */
  const quickSave = (n: number) => {
    const isCheckout = n === currentScores[player] && canFinish(n, game.doubleOut);
    if (isCheckout && !validCheckout(n, 3, game.doubleOut)) {
      setInput(String(n));
      setError('');
      feedback.selection();
      return;
    }
    saveWith(3, n);
  };
  const lastTurn = game.turns.findLast((t) => !t.undone);
  return (
    <View className="bg-background flex-1">
      <Stack.Screen options={{ title: 'Zápas' }} />
      <FlatList
        data={game.turns.toReversed()}
        keyExtractor={(_, index) => `${game.id}-${game.turns.length - index}`}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 32,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View>
            <StorageNotice />
            <View className="bg-ink mb-3 overflow-hidden rounded-[22px]">
              {/* Kolo/leg tu nie je — legy sú v žltom páse, miesto dostalo väčšie skóre. */}
              <View className="flex-row px-3 pt-3 pb-1.5">
                {(game.solo ? ([0] as const) : ([0, 1] as const)).map((p) => (
                  <View
                    key={p}
                    className={`flex-1 items-center px-2 ${p === 0 && !game.solo ? 'border-on-ink/20 border-r' : ''}`}
                  >
                    <Txt className="text-on-ink text-[16px]" numberOfLines={1}>
                      {p === 0 ? me : practice ? 'Hráč 2' : opponentFirst}
                    </Txt>
                    <Txt
                      className={`${game.solo ? 'text-[96px] leading-[108px]' : 'text-[74px] leading-[88px]'} ${!finished && player === p ? 'text-accent' : 'text-white'}`}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={{
                        fontFamily: 'Inter_700Bold',
                        fontVariant: ['tabular-nums'],
                        letterSpacing: -2,
                      }}
                      maxFontSizeMultiplier={1.15}
                    >
                      {currentScores[p]}
                    </Txt>
                    <Txt className="text-on-ink text-[14px]">Priemer {average(game, p)}</Txt>
                  </View>
                ))}
              </View>
              {/* Legy: moje vľavo, súperove vpravo; v strede na koľko sa hrá. */}
              <ScoreStrip
                left={`Legy ${game.legs[0]}`}
                right={game.solo ? undefined : `Legy ${game.legs[1]}`}
                center={
                  finished
                    ? game.winner === 0
                      ? 'Vyhral si!'
                      : `${practice ? 'Hráč 2' : opponentFirst} vyhráva!`
                    : `First to ${game.legsToWin}`
                }
              />
            </View>
            {finished ? (
              <View className="items-center gap-4 py-6">
                <Trophy size={36} color={palette.ink} strokeWidth={1.8} />
                <Heading>{game.winner === 0 ? 'Dobrý zásah.' : 'Čas na odvetu.'}</Heading>
                {game.legsToWin > 1 && (
                  <Txt className="text-muted text-[14px]">
                    Legy {game.legs[0]}:{game.legs[1]}
                  </Txt>
                )}
                {!!myNick && <ShareResult {...localGameShare(game, myNick, friends)} />}
                {/* Odveta: uloží výsledok a hneď začne nový zápas s rovnakým súperom a nastaveniami. */}
                <Button
                  size="lg"
                  className="w-full"
                  onPress={() => {
                    const g = game;
                    archiveGame();
                    startGame(
                      {
                        id: g.opponentId,
                        name: g.opponentName,
                        handle: g.opponentName,
                        color: 'blue',
                        demo: false,
                      },
                      g.starting,
                      g.doubleOut,
                      g.legsToWin,
                      !!g.solo,
                      g.bot,
                    );
                    setInput('');
                    setError('');
                    feedback.success();
                  }}
                >
                  <RotateCcw size={20} color={palette.navy} strokeWidth={1.8} />
                  <Button.Label>Odveta</Button.Label>
                </Button>
                <Button
                  size="lg"
                  variant="tertiary"
                  className="w-full"
                  onPress={() => {
                    archiveGame();
                    feedback.success();
                    router.dismissTo('/');
                  }}
                >
                  <Button.Label>Uložiť výsledok</Button.Label>
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    undo();
                    setInput('');
                    feedback.success();
                  }}
                >
                  <Undo2 size={18} color={palette.ink} />
                  <Button.Label>Opraviť posledný ťah</Button.Label>
                </Button>
              </View>
            ) : legBreak ? (
              <View className="items-center gap-4 py-6">
                <Trophy size={36} color={palette.ink} strokeWidth={1.8} />
                <Heading>
                  Leg {legNo - 1}: {legWinnerName}
                </Heading>
                <Txt className="text-muted text-[14px]">
                  Stav legov {game.legs[0]}:{game.legs[1]} · hrá sa do {game.legsToWin}
                </Txt>
                <Button
                  size="lg"
                  className="w-full"
                  onPress={() => {
                    startNextLeg();
                    setInput('');
                    setError('');
                    feedback.success();
                  }}
                >
                  <Button.Label>Začať ďalší leg</Button.Label>
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    undo();
                    setInput('');
                    feedback.success();
                  }}
                >
                  <Undo2 size={18} color={palette.ink} />
                  <Button.Label>Opraviť posledný ťah</Button.Label>
                </Button>
              </View>
            ) : botTurn ? (
              <View className="items-center gap-3 py-8" accessibilityLiveRegion="polite">
                <Spinner />
                <Txt>{game.opponentName} hádže…</Txt>
                <Button
                  variant="ghost"
                  isDisabled={!game.turns.length}
                  onPress={() => {
                    undo();
                    setInput('');
                    setError('');
                    feedback.success();
                  }}
                >
                  <Undo2 size={18} color={palette.ink} strokeWidth={1.8} />
                  <Button.Label>Opraviť posledný ťah</Button.Label>
                </Button>
              </View>
            ) : (
              <View>
                {lastTurn?.bust && (
                  <Txt className="text-danger mt-4 text-[13px]">
                    Prehodené alebo neplatné ukončenie. Skóre zostáva.
                  </Txt>
                )}
                <View className="mt-2 mb-2 flex-row items-center justify-between">
                  <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Nahrané skóre</Txt>
                  <Txt
                    className={`text-[30px] leading-9 ${input ? '' : 'text-muted'}`}
                    style={{ fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}
                    accessibilityLiveRegion="polite"
                  >
                    {input || '0'}
                  </Txt>
                </View>
                {!voiceOn && frequent.length > 0 && (
                  <View className="mb-2 flex-row gap-2">
                    {frequent.map((n) => (
                      <Button
                        key={n}
                        variant="tertiary"
                        className="border-accent h-14 flex-1 rounded-xl border-2"
                        onPress={() => quickSave(n)}
                      >
                        <Button.Label
                          className="text-[22px]"
                          style={{ fontFamily: 'Inter_700Bold' }}
                        >
                          {n}
                        </Button.Label>
                      </Button>
                    ))}
                  </View>
                )}
                {(voiceOn
                  ? []
                  : [
                      [1, 2, 3],
                      [4, 5, 6],
                      [7, 8, 9],
                    ]
                ).map((row) => (
                  <View key={row.join('-')} className="mb-2 flex-row gap-2">
                    {row.map((n) => (
                      <Button
                        key={n}
                        variant="secondary"
                        className="bg-surface h-15 flex-1 rounded-xl"
                        onPress={() => append(String(n))}
                      >
                        <Button.Label
                          className="text-[24px]"
                          style={{ fontFamily: 'Inter_600SemiBold' }}
                        >
                          {n}
                        </Button.Label>
                      </Button>
                    ))}
                  </View>
                ))}
                <View className="mb-3 flex-row gap-2">
                  <Button
                    className="h-15 flex-1 rounded-xl"
                    variant="secondary"
                    isDisabled={!game.turns.length}
                    accessibilityLabel="Vrátiť posledný ťah"
                    onPress={() => {
                      undo();
                      setInput('');
                      setError('');
                      feedback.success();
                    }}
                  >
                    <Undo2 size={24} color={palette.yellow} strokeWidth={1.8} />
                  </Button>
                  {!voiceOn && (
                    <Button
                      className="bg-surface h-15 flex-1 rounded-xl"
                      variant="secondary"
                      onPress={() => append('0')}
                    >
                      <Button.Label
                        className="text-[24px]"
                        style={{ fontFamily: 'Inter_600SemiBold' }}
                      >
                        0
                      </Button.Label>
                    </Button>
                  )}
                  <Button
                    className="h-15 flex-1 rounded-xl"
                    variant="secondary"
                    isDisabled={!input}
                    accessibilityLabel="Vymazať poslednú číslicu"
                    onPress={() => {
                      setInput(input.slice(0, -1));
                      setError('');
                      feedback.selection();
                    }}
                  >
                    <Delete size={24} color={palette.yellow} strokeWidth={1.8} />
                  </Button>
                </View>
                {checkout ? (
                  <View className="bg-surface mb-4 gap-3 rounded-2xl p-4">
                    <Txt className="text-center" style={{ fontFamily: 'Inter_600SemiBold' }}>
                      Zavrel si hru {score}! Koľkými šípkami?
                    </Txt>
                    <View className="flex-row gap-2">
                      {([1, 2, 3] as const).map((n) => {
                        const ok = validCheckout(score, n, game.doubleOut);
                        return (
                          <Button
                            key={n}
                            className="h-14 flex-1 rounded-xl"
                            variant="primary"
                            isDisabled={!ok}
                            onPress={() => saveWith(n)}
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
                ) : (
                  <Button
                    size="lg"
                    className="rounded-xl"
                    nativeID="score-submit"
                    isDisabled={!input}
                    onPress={() => saveWith(3)}
                  >
                    <Button.Label>{input ? `Zapísať ${input}` : 'Zapísať skóre'}</Button.Label>
                    <Check size={21} color={palette.navy} strokeWidth={1.8} />
                  </Button>
                )}
                {/* Hlas až pod Zapísať — aby sa pri ťukaní čísel nezapol omylom. */}
                <View className="mt-6">
                  <VoiceScore
                    on={voiceOn}
                    setOn={setVoiceOn}
                    validate={(n) =>
                      validScore(n) ? null : 'toto skóre sa tromi šípkami hodiť nedá.'
                    }
                    needsDarts={(n) => n === currentScores[player] && canFinish(n, game.doubleOut)}
                    onPreview={(n) => {
                      setInput(String(n));
                      setError('');
                    }}
                    onCommit={(n) => saveWith(3, n)}
                    onCancel={() => setInput('')}
                  />
                </View>
                {!!error && (
                  <Txt className="text-danger mb-3 text-[13px]" accessibilityRole="alert">
                    {error}
                  </Txt>
                )}
                {!checkout && !game.turns.length && (
                  <Txt className="text-muted mt-3 text-center text-[12px]">
                    Žiadny zásah? Zapíš 0.
                  </Txt>
                )}
              </View>
            )}
            {game.turns.length > 0 && (
              <View className="mt-7 mb-2">
                <Heading className="text-[20px]">Priebeh zápasu</Heading>
                <View className="mt-3 flex-row justify-between">
                  <Txt className="text-muted text-[12px]">Hráč / skóre ťahu</Txt>
                  <Txt className="text-muted text-[12px]">Zostáva</Txt>
                </View>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(100)}
            className="border-border flex-row items-center gap-3 border-b py-3"
          >
            <Txt className="flex-1 text-[14px]" numberOfLines={1}>
              {item.player === 0 ? me : practice ? 'Hráč 2' : opponentFirst}
            </Txt>
            <Txt
              className={
                item.undone
                  ? 'text-muted text-[14px]'
                  : item.bust
                    ? 'text-danger text-[14px]'
                    : 'text-[14px]'
              }
              style={item.undone ? { textDecorationLine: 'line-through' } : undefined}
            >
              {item.undone ? item.score : item.bust ? `Prehodené (${item.score})` : item.score}
            </Txt>
            <Txt
              className="w-12 text-right text-[14px]"
              style={{ fontFamily: 'Inter_600SemiBold' }}
            >
              {item.remaining}
            </Txt>
          </Animated.View>
        )}
        ListFooterComponent={
          <View className="mt-6 gap-2">
            {discard ? (
              <View className="gap-3">
                <Txt>Zahodiť tento zápas bez výsledku?</Txt>
                <Button
                  variant="danger"
                  onPress={() => {
                    discardGame();
                    feedback.success();
                    router.dismissTo('/');
                  }}
                >
                  <Button.Label>Zahodiť zápas</Button.Label>
                </Button>
                <Button variant="ghost" onPress={() => setDiscard(false)}>
                  <Button.Label>Pokračovať</Button.Label>
                </Button>
              </View>
            ) : (
              <>
                <Button variant="ghost" onPress={() => router.dismissTo('/')}>
                  <Button.Label>Späť domov</Button.Label>
                </Button>
                {!finished && (
                  <Button variant="ghost" onPress={() => setDiscard(true)}>
                    <Button.Label className="text-muted">Zahodiť zápas</Button.Label>
                  </Button>
                )}
              </>
            )}
          </View>
        }
      />
    </View>
  );
}

import { useState } from 'react';
import { View, FlatList } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Video, X, Delete, Undo2, Check, Trophy } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Txt, Heading, Empty, StorageNotice, LoadingRows } from '@/components/DartsUI';
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
  legTurns,
} from '@/lib/darts';

export default function Match() {
  const game = useDarts((s) => s.game);
  const hydrated = useDarts((s) => s.hydrated);
  const submitTurn = useDarts((s) => s.submitTurn);
  const undo = useDarts((s) => s.undo);
  const startNextLeg = useDarts((s) => s.startNextLeg);
  const archiveGame = useDarts((s) => s.archiveGame);
  const discardGame = useDarts((s) => s.discardGame);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [video, setVideo] = useState(false);
  const [discard, setDiscard] = useState(false);
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
  const opponentFirst = game.opponentName.split(' ')[0];
  const practice = game.opponentId === 'practice';
  const name = player === 0 ? 'Ty' : practice ? 'Hráč 2' : opponentFirst;
  const score = Number(input);
  const checkout =
    !!input && score === currentScores[player] && validScore(score) && canFinish(score, game.doubleOut);
  const finished = game.winner !== null;
  const legBreak = game.betweenLegs;
  const legNo = currentLeg(game) + 1;
  const legWinnerName = (() => {
    if (!legBreak) return '';
    const last = game.turns.at(-1);
    if (!last) return '';
    return last.player === 0 ? 'Ty' : practice ? 'Hráč 2' : opponentFirst;
  })();
  const append = (digit: string) => {
    if (input.length >= 3) return;
    setInput(input === '0' ? digit : input + digit);
    setError('');
    feedback.selection();
  };
  /** Uloženie ťahu. Pri zatváraní hry (skóre 0) volá hráč s počtom šípok 1/2/3. */
  const saveWith = (chosenDarts: 1 | 2 | 3) => {
    if (!input || !validScore(score)) {
      setError('Zadaj možné skóre troch šípok od 0 do 180.');
      feedback.error();
      return;
    }
    if (checkout && !validCheckout(score, chosenDarts, game.doubleOut)) {
      setError('Toto skóre nemožno zatvoriť zvoleným počtom šípok. Skontroluj výber.');
      feedback.error();
      return;
    }
    submitTurn(score, checkout, checkout ? chosenDarts : 3);
    setInput('');
    setError('');
    if (useDarts.getState().game?.turns.at(-1)?.bust) feedback.error();
    else feedback.success();
  };
  const lastTurn = game.turns.at(-1);
  return (
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          title: 'Zápas',
          headerRight: () => (
            <Button
              variant="ghost"
              isIconOnly
              size="sm"
              accessibilityLabel="Videohovor"
              onPress={() => setVideo((v) => !v)}
            >
              <Video size={22} color={palette.ink} strokeWidth={1.8} />
            </Button>
          ),
        }}
      />
      <FlatList
        data={game.turns.toReversed()}
        keyExtractor={(_, index) => `${game.id}-${game.turns.length - index}`}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 32,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View>
            <StorageNotice />
            <View className="mb-4 flex-row items-center justify-between">
              <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>
                {game.starting} · {game.doubleOut ? 'Double out' : 'Straight out'}
                {game.legsToWin > 1 && ` · Legy ${game.legs[0]}:${game.legs[1]} (do ${game.legsToWin})`}
              </Txt>
              <Txt className="text-muted mt-2 text-[12px]">Lokálna hra</Txt>
            </View>
            {!finished && !legBreak && game.legsToWin > 1 && (
              <Txt className="text-muted mb-3 text-center text-[13px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
                Leg {legNo} · začína {currentLeg(game) % 2 === 0 ? 'Ty' : practice ? 'Hráč 2' : opponentFirst}
              </Txt>
            )}
            {video && (
              <View className="bg-default mb-4 rounded-2xl p-5">
                <View className="flex-row items-center justify-between">
                  <Video size={26} color={palette.ink} />
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    accessibilityLabel="Zavrieť informácie o videu"
                    onPress={() => setVideo(false)}
                  >
                    <X size={20} color={palette.ink} />
                  </Button>
                </View>
                <Txt style={{ fontFamily: 'Inter_600SemiBold' }} className="mt-3">
                  Videohovor v online zápase
                </Txt>
                <Txt className="text-muted mt-2 text-[13px] leading-5">
                  Pre videohovor pozvi priateľa do online zápasu. Lokálna hra je určená na hranie
                  pri jednom terči.
                </Txt>
                <Button className="mt-3" variant="secondary" onPress={() => router.push('/online')}>
                  <Button.Label>Online zápasy</Button.Label>
                </Button>
              </View>
            )}
            <View className="bg-ink overflow-hidden rounded-[22px]">
              <View className="flex-row items-center justify-center gap-2 pt-4">
                <View className="bg-accent h-1.5 w-1.5 rounded-full" />
                <Txt className="text-on-ink text-[12px]">
                  {finished
                    ? 'Zápas dohraný'
                    : `Kolo ${Math.floor(legTurns(game).length / 2) + 1}${game.legsToWin > 1 ? ` · leg ${legNo}` : ''}`}
                </Txt>
              </View>
              <View className="flex-row px-4 py-4">
                {([0, 1] as const).map((p) => (
                  <View
                    key={p}
                    className={`flex-1 items-center px-2 ${p === 0 ? 'border-on-ink/20 border-r' : ''}`}
                  >
                    <Txt className="text-on-ink text-[14px]" numberOfLines={1}>
                      {p === 0 ? 'Ty' : practice ? 'Hráč 2' : opponentFirst}
                    </Txt>
                    <Txt
                      className={`text-[54px] leading-[66px] ${!finished && player === p ? 'text-accent' : 'text-white'}`}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={{
                        fontFamily: 'Inter_700Bold',
                        fontVariant: ['tabular-nums'],
                        letterSpacing: -3,
                      }}
                      maxFontSizeMultiplier={1.15}
                    >
                      {currentScores[p]}
                    </Txt>
                    <Txt className="text-on-ink text-[12px]">Priemer {average(game, p)}</Txt>
                  </View>
                ))}
              </View>
              <View className="bg-accent px-4 py-3">
                <Txt
                  className="text-center text-[13px]"
                  style={{ fontFamily: 'Inter_600SemiBold' }}
                >
                  {finished
                    ? game.winner === 0
                      ? 'Vyhral si!'
                      : `${practice ? 'Hráč 2' : opponentFirst} vyhráva!`
                    : `Na ťahu: ${name}`}
                </Txt>
              </View>
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
                <Button
                  size="lg"
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
            ) : (
              <View>
                {lastTurn?.bust && (
                  <Txt className="text-danger mt-4 text-[13px]">
                    Prehodené alebo neplatné ukončenie. Skóre zostáva.
                  </Txt>
                )}
                <View className="mt-5 mb-3 flex-row items-center justify-between">
                  <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Súčet 3 šípok</Txt>
                  <Txt
                    className="text-[30px] leading-9"
                    style={{ fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}
                    accessibilityLiveRegion="polite"
                  >
                    {input || '—'}
                  </Txt>
                </View>
                <View className="mb-3 flex-row gap-2">
                  {[26, 41, 60, 100].map((n) => (
                    <Button
                      key={n}
                      variant="secondary"
                      size="sm"
                      className="flex-1 rounded-lg"
                      onPress={() => {
                        setInput(String(n));
                        setError('');
                        feedback.selection();
                      }}
                    >
                      <Button.Label>{n}</Button.Label>
                    </Button>
                  ))}
                </View>
                {[
                  [1, 2, 3],
                  [4, 5, 6],
                  [7, 8, 9],
                ].map((row) => (
                  <View key={row.join('-')} className="mb-2 flex-row gap-2">
                    {row.map((n) => (
                      <Button
                        key={n}
                        variant="secondary"
                        className="bg-surface h-12 flex-1 rounded-xl"
                        onPress={() => append(String(n))}
                      >
                        <Button.Label
                          className="text-[21px]"
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
                    className="h-12 flex-1 rounded-xl"
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
                    <Undo2 size={21} color={palette.ink} strokeWidth={1.8} />
                  </Button>
                  <Button
                    className="bg-surface h-12 flex-1 rounded-xl"
                    variant="secondary"
                    onPress={() => append('0')}
                  >
                    <Button.Label
                      className="text-[21px]"
                      style={{ fontFamily: 'Inter_600SemiBold' }}
                    >
                      0
                    </Button.Label>
                  </Button>
                  <Button
                    className="h-12 flex-1 rounded-xl"
                    variant="secondary"
                    isDisabled={!input}
                    accessibilityLabel="Vymazať poslednú číslicu"
                    onPress={() => {
                      setInput(input.slice(0, -1));
                      setError('');
                      feedback.selection();
                    }}
                  >
                    <Delete size={21} color={palette.ink} strokeWidth={1.8} />
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
                    isDisabled={!input}
                    onPress={() => saveWith(3)}
                  >
                    <Button.Label>{input ? `Zapísať ${input}` : 'Zapísať skóre'}</Button.Label>
                    <Check size={21} color={palette.ink} strokeWidth={1.8} />
                  </Button>
                )}
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
              {item.player === 0 ? 'Ty' : practice ? 'Hráč 2' : opponentFirst}
            </Txt>
            <Txt className={item.bust ? 'text-danger text-[14px]' : 'text-[14px]'}>
              {item.bust ? `Prehodené (${item.score})` : item.score}
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

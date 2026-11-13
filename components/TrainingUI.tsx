import type { ReactNode } from 'react';
import { Image, ScrollView, View, type ImageSourcePropType } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Target, Trophy, Undo2 } from 'lucide-react-native';
import { Heading, Txt, LoadingRows } from '@/components/DartsUI';
import { PadButton, ScoreBoard } from '@/components/GameBoard';
import { palette } from '@/lib/darts';
import { ShareResult } from '@/components/ShareResult';
import { formatTrainingResult } from '@/lib/matchResult';
import { usePlayers } from '@/lib/players';
import { TrainingHistory } from '@/components/TrainingHistory';
import { ChallengeButton } from '@/components/Challenge';
import { challengeMet, useChallenge } from '@/lib/challenge';
import { sendResult } from '@/lib/matchResult';
import { useExtraGames, type TrainingMode } from '@/lib/games';
import { useTrainingPresence } from '@/lib/online';
import { renderResultImage } from '@/lib/resultImage';

export type TrainingStat = { label: string; value: string };

/** Výber z možností ako tlačidlá klávesnice (počet kôl, šípok…). */
export function OptionPicker<T>({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <View className="gap-2">
      <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>{label}</Txt>
      <View className="flex-row gap-2">
        {options.map((o) => (
          <PadButton
            key={format(o)}
            label={format(o)}
            accessibilityLabel={`${label} ${format(o) === '∞' ? 'nekonečno' : format(o)}`}
            selected={o === value}
            toggle
            onPress={() => onChange(o)}
          />
        ))}
      </View>
    </View>
  );
}

/** Spoločný rámec tréningov vo vzhľade zápasu 301/501: úvod → hra → výsledok. */
export function TrainingScreen({
  title,
  hydrated,
  running,
  intro,
  onStart,
  top,
  big,
  sub,
  bottom,
  done,
  result,
  onFinish,
  onUndo,
  canUndo,
  hideUndo = false,
  introExtra,
  stats = [],
  shareScore,
  onEnd,
  icon,
  mode,
  scoreValue = null,
  lowerIsBetter = false,
  unit = '',
  onCancel,
  children,
}: {
  /** Druh tréningu — pre históriu a štatistiky. */
  mode: TrainingMode;
  /** Číselný výsledok (rekord, priemer v štatistikách). */
  scoreValue?: number | null;
  /** Menej je lepšie (napr. počet šípok v Around the Clock). */
  lowerIsBetter?: boolean;
  /** Jednotka výsledku v štatistikách (bodov, šípok…). */
  unit?: string;
  title: string;
  hydrated: boolean;
  running: boolean;
  intro: string;
  onStart: () => void;
  /** Malý text hore na tabuli (kolo, pokus). */
  top: string;
  /** Veľký údaj na tabuli (aktuálny cieľ / skóre). */
  big: string;
  sub?: string;
  /** Žltý pásik (čo práve hádžeš). */
  bottom: string;
  done: boolean;
  result: string;
  onFinish: () => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Vlastné tlačidlo späť (napr. v číselnej klávesnici). */
  hideUndo?: boolean;
  /** Nastavenia pred začatím (napr. počet šípok). */
  introExtra?: ReactNode;
  /** Štatistiky na konci tréningu (ukážu sa a dajú sa poslať priateľovi). */
  stats?: TrainingStat[];
  /** Veľké číslo na obrázku (predvolene `big`). */
  shareScore?: string;
  /** Ukončenie skôr (pri ∞ kolách) — ukáže výsledky a štatistiky. */
  onEnd?: () => void;
  /** Ikona tréningu (úvod). */
  icon?: ImageSourcePropType;
  onCancel: () => void;
  /** Riadky klávesnice (len počas hry). */
  children: ReactNode;
}) {
  const myNick = usePlayers((s) => s.profile?.nickname);
  const addEntry = useExtraGames((s) => s.addTrainingEntry);
  // Prijatá výzva pre tento tréning (z chatu).
  const challenge = useChallenge((s) => (s.active?.mode === mode ? s.active : null));
  const clearChallenge = useChallenge((s) => s.clear);
  const challengeDone =
    challenge && done && scoreValue !== null ? challengeMet(challenge, scoreValue) : null;
  // Priatelia uvidia „Trénuje“, kým je tréning rozohraný a obrazovka otvorená.
  useTrainingPresence(running && !done);
  return (
    <View className="bg-background flex-1">
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 32,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {!hydrated ? (
          <LoadingRows />
        ) : !running ? (
          <View className="mt-3 gap-4">
            <View className="flex-row items-center gap-4">
              {!!icon && (
                <Image
                  source={icon}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  style={{ width: 72, height: 72, borderRadius: 18 }}
                />
              )}
              <Heading>{title}</Heading>
            </View>
            {challenge && (
              <View className="bg-ink gap-2 rounded-2xl p-4">
                <Txt className="text-white" style={{ fontFamily: 'Inter_700Bold' }}>
                  🏆 Výzva od @{challenge.fromNick}
                </Txt>
                <Txt className="text-on-ink text-[13px]">
                  {challenge.lower ? 'Zvládni to za' : 'Prekonaj'} {challenge.target}
                  {challenge.unit ? ` ${challenge.unit}` : ''}. Výsledok sa mu po uložení pošle sám.
                </Txt>
                <Button
                  size="sm"
                  variant="tertiary"
                  className="self-start"
                  onPress={clearChallenge}
                >
                  <Button.Label>Zrušiť výzvu</Button.Label>
                </Button>
              </View>
            )}
            <Txt className="text-muted text-[14px] leading-6">{intro}</Txt>
            {introExtra}
            <Button size="lg" onPress={onStart}>
              <Target size={20} color={palette.navy} strokeWidth={1.8} />
              <Button.Label>Začať tréning</Button.Label>
            </Button>
            <Button variant="ghost" onPress={() => router.dismissTo('/games')}>
              <Button.Label>Späť na tréning</Button.Label>
            </Button>
            <TrainingHistory mode={mode} title={title} lowerIsBetter={lowerIsBetter} unit={unit} />
          </View>
        ) : (
          <>
            <ScoreBoard
              top={top}
              players={[{ name: title, value: big, sub }]}
              active={done ? null : 0}
              bottom={bottom}
            />
            {done ? (
              <View className="items-center gap-4 py-6">
                <Trophy size={36} color={palette.ink} strokeWidth={1.8} />
                <Heading>{result}</Heading>
                {challenge && challengeDone !== null && (
                  <Txt
                    className="text-center"
                    style={{
                      fontFamily: 'Inter_700Bold',
                      color: challengeDone ? palette.success : palette.danger,
                    }}
                  >
                    {challengeDone
                      ? `✅ Výzvu od @${challenge.fromNick} si splnil!`
                      : `❌ Výzvu od @${challenge.fromNick} si nesplnil (cieľ ${challenge.target}).`}{' '}
                    Výsledok mu pošleme po uložení.
                  </Txt>
                )}
                {stats.length > 0 && (
                  <View className="bg-surface w-full rounded-xl px-4 py-2">
                    {stats.map((st) => (
                      <View
                        key={st.label}
                        className="border-border flex-row justify-between gap-4 border-b py-2"
                      >
                        <Txt className="text-muted flex-1">{st.label}</Txt>
                        <Txt
                          style={{ fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] }}
                        >
                          {st.value}
                        </Txt>
                      </View>
                    ))}
                  </View>
                )}
                {scoreValue !== null && !!myNick && (
                  <ChallengeButton
                    challenge={{ mode, target: scoreValue, lower: lowerIsBetter, unit }}
                    result={{
                      body: formatTrainingResult({ me: myNick, title, result, stats }),
                      image: () =>
                        renderResultImage({
                          subtitle: `Tréning · ${title}`,
                          players: [{ name: `@${myNick}`, score: shareScore ?? big }],
                          winner: null,
                          rows: stats.map((st) => ({ label: st.label, values: [st.value] })),
                        }),
                    }}
                  />
                )}
                {!!myNick && (
                  <ShareResult
                    body={formatTrainingResult({ me: myNick, title, result, stats })}
                    image={() =>
                      renderResultImage({
                        subtitle: `Tréning · ${title}`,
                        players: [{ name: `@${myNick}`, score: shareScore ?? big }],
                        winner: null,
                        rows: stats.map((st) => ({ label: st.label, values: [st.value] })),
                      })
                    }
                  />
                )}
                <Button
                  size="lg"
                  className="w-full"
                  onPress={() => {
                    // Uloží tréning do histórie (štatistiky, poslanie neskôr).
                    addEntry({ mode, result, score: shareScore ?? big, value: scoreValue, stats });
                    // Výzva: výsledok sa automaticky pošle tomu, kto ťa vyzval.
                    if (challenge && challengeDone !== null && myNick) {
                      const verdict = challengeDone ? '✅ Výzva splnená' : '❌ Výzva nesplnená';
                      void sendResult(
                        challenge.fromId,
                        myNick,
                        formatTrainingResult({
                          me: myNick,
                          title,
                          result: `${verdict} · ${result} (cieľ ${challenge.target}${challenge.unit ? ` ${challenge.unit}` : ''})`,
                          stats,
                        }),
                        () =>
                          renderResultImage({
                            subtitle: `Výzva · ${title}`,
                            players: [{ name: `@${myNick}`, score: shareScore ?? big }],
                            winner: challengeDone ? 0 : null,
                            rows: stats.map((st) => ({ label: st.label, values: [st.value] })),
                          }),
                      ).catch(() => undefined);
                      clearChallenge();
                    }
                    onFinish();
                    router.dismissTo('/games');
                  }}
                >
                  <Button.Label>Uložiť výsledok</Button.Label>
                </Button>
                <Button variant="ghost" isDisabled={!canUndo} onPress={onUndo}>
                  <Undo2 size={18} color={palette.ink} />
                  <Button.Label>Opraviť posledný hod</Button.Label>
                </Button>
              </View>
            ) : (
              <View className="gap-2">
                {children}
                {!hideUndo && (
                  <View className="flex-row gap-2">
                    <PadButton
                      accessibilityLabel="Vrátiť posledný hod"
                      disabled={!canUndo}
                      onPress={onUndo}
                    >
                      <Undo2 size={20} color={palette.yellow} strokeWidth={1.8} />
                      <Button.Label
                        className="text-[16px]"
                        style={{ fontFamily: 'Inter_600SemiBold' }}
                      >
                        Späť
                      </Button.Label>
                    </PadButton>
                  </View>
                )}
                {!!onEnd && (
                  <Button className="mt-4" variant="secondary" onPress={onEnd}>
                    <Button.Label>Ukončiť tréning a zobraziť výsledky</Button.Label>
                  </Button>
                )}
                <Button className="mt-4" variant="ghost" onPress={onCancel}>
                  <Button.Label>Zrušiť tréning</Button.Label>
                </Button>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

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
  onCancel,
  children,
}: {
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
            <Txt className="text-muted text-[14px] leading-6">{intro}</Txt>
            {introExtra}
            <Button size="lg" onPress={onStart}>
              <Target size={20} color={palette.ink} strokeWidth={1.8} />
              <Button.Label>Začať tréning</Button.Label>
            </Button>
            <Button variant="ghost" onPress={() => router.dismissTo('/games')}>
              <Button.Label>Späť na tréning</Button.Label>
            </Button>
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
                      <Undo2 size={21} color={palette.yellow} strokeWidth={1.8} />
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

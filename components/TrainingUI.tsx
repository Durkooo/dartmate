import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Target, Trophy, Undo2 } from 'lucide-react-native';
import { Heading, Txt, LoadingRows } from '@/components/DartsUI';
import { PadButton, ScoreBoard } from '@/components/GameBoard';
import { palette } from '@/lib/darts';

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
  onCancel: () => void;
  /** Riadky klávesnice (len počas hry). */
  children: ReactNode;
}) {
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
            <Heading>{title}</Heading>
            <Txt className="text-muted text-[14px] leading-6">{intro}</Txt>
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
                      <Undo2 size={21} color={palette.ink} strokeWidth={1.8} />
                    </PadButton>
                  </View>
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

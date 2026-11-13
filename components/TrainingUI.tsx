import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Trophy, Undo2 } from 'lucide-react-native';
import { Page, Heading, Txt, LoadingRows } from '@/components/DartsUI';
import { palette } from '@/lib/darts';

/** Spoločný rámec tréningových hier: úvod → hra → výsledok. */
export function TrainingScreen({
  title,
  hydrated,
  running,
  intro,
  onStart,
  big,
  caption,
  done,
  result,
  onFinish,
  onUndo,
  canUndo,
  onCancel,
  children,
}: {
  title: string;
  hydrated: boolean;
  running: boolean;
  intro: string;
  onStart: () => void;
  /** Veľký údaj (aktuálny cieľ). */
  big: string;
  caption: string;
  done: boolean;
  result: string;
  onFinish: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onCancel: () => void;
  /** Tlačidlá pre zadávanie (len počas hry). */
  children: ReactNode;
}) {
  if (!hydrated)
    return (
      <Page>
        <LoadingRows />
      </Page>
    );
  return (
    <Page hideFallback={running}>
      <Stack.Screen options={{ title }} />
      {!running ? (
        <View className="mt-3 gap-4">
          <Heading>{title}</Heading>
          <Txt className="text-muted text-[14px] leading-6">{intro}</Txt>
          <Button size="lg" onPress={onStart}>
            <Button.Label>Začať</Button.Label>
          </Button>
        </View>
      ) : (
        <View className="mt-3 gap-4">
          <View className="bg-ink items-center rounded-xl p-5">
            <Txt className="text-on-ink text-[13px]">{caption}</Txt>
            <Txt
              style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 56,
                lineHeight: 64,
                color: palette.yellow,
                fontVariant: ['tabular-nums'],
              }}
            >
              {big}
            </Txt>
          </View>
          {done ? (
            <View className="items-center gap-3 py-2">
              <Trophy size={32} color={palette.ink} strokeWidth={1.8} />
              <Heading>{result}</Heading>
              <Button
                size="lg"
                className="w-full"
                onPress={() => {
                  onFinish();
                  router.dismissTo('/games');
                }}
              >
                <Button.Label>Uložiť a skončiť</Button.Label>
              </Button>
            </View>
          ) : (
            children
          )}
          <View className="flex-row gap-2">
            <Button className="flex-1" variant="ghost" isDisabled={!canUndo} onPress={onUndo}>
              <Undo2 size={18} color={palette.ink} />
              <Button.Label>Späť</Button.Label>
            </Button>
            {!done && (
              <Button className="flex-1" variant="ghost" onPress={onCancel}>
                <Button.Label>Zrušiť hru</Button.Label>
              </Button>
            )}
          </View>
        </View>
      )}
    </Page>
  );
}

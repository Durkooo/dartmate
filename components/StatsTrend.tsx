import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Txt } from '@/components/DartsUI';
import { palette } from '@/lib/darts';

type Point = { id: string; date: string; avg: number };

/** Stĺpcový graf priemeru na 3 šípky v posledných zápasoch (jedna séria).
 *  Ťuknutím na stĺpec sa ukáže presná hodnota a dátum. */
export function StatsTrend({ points }: { points: Point[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.avg), 1);
  const height = 120;
  const active = points.find((p) => p.id === selected) ?? points.at(-1)!;
  return (
    <View className="mt-6 gap-2">
      <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Priemer v posledných zápasoch</Txt>
      <Txt className="text-muted text-[13px]">
        {active.id === points.at(-1)!.id ? 'Posledný zápas' : 'Vybraný zápas'}:{' '}
        <Txt style={{ fontFamily: 'Inter_600SemiBold', color: palette.ink }}>
          {active.avg.toFixed(1)}
        </Txt>{' '}
        · {active.date ? new Date(active.date).toLocaleDateString('sk-SK') : ''}
      </Txt>
      <View
        accessibilityRole="image"
        accessibilityLabel={`Priemer v posledných ${points.length} zápasoch: ${points
          .map((p) => p.avg.toFixed(1))
          .join(', ')}`}
        style={{
          height,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 2,
          borderBottomWidth: 1,
          borderBottomColor: palette.line,
        }}
      >
        {points.map((p) => {
          const on = p.id === active.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setSelected(p.id)}
              accessibilityLabel={p.avg.toFixed(1)}
              style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}
            >
              <View
                style={{
                  height: Math.max(3, (p.avg / max) * (height - 8)),
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  backgroundColor: palette.ink,
                  opacity: on ? 1 : 0.35,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row justify-between">
        <Txt className="text-muted text-[11px]">staršie</Txt>
        <Txt className="text-muted text-[11px]">najnovšie</Txt>
      </View>
    </View>
  );
}

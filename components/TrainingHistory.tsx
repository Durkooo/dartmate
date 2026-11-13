import { useState } from 'react';
import { View } from 'react-native';
import { PressableFeedback } from 'heroui-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Heading, Txt } from '@/components/DartsUI';
import { ShareResult } from '@/components/ShareResult';
import { ChallengeButton } from '@/components/Challenge';
import { CARD_ROW, palette } from '@/lib/darts';
import { useExtraGames, type TrainingEntry, type TrainingMode } from '@/lib/games';
import { formatTrainingResult } from '@/lib/matchResult';
import { usePlayers } from '@/lib/players';
import { renderResultImage } from '@/lib/resultImage';

function EntryRow({
  entry,
  title,
  lowerIsBetter,
  unit,
}: {
  entry: TrainingEntry;
  title: string;
  lowerIsBetter: boolean;
  unit: string;
}) {
  const myNick = usePlayers((s) => s.profile?.nickname);
  const [open, setOpen] = useState(false);
  return (
    <View className="mb-2">
      <PressableFeedback
        className={CARD_ROW.replace('mb-2 ', '')}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View className="flex-1 gap-1">
          <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
            {entry.result}
          </Txt>
          <Txt className="text-muted text-[12px]">
            {new Date(entry.date).toLocaleDateString('sk-SK')} ·{' '}
            {new Date(entry.date).toLocaleTimeString('sk-SK', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Txt>
        </View>
        {open ? (
          <ChevronDown size={20} color={palette.ink} strokeWidth={1.8} />
        ) : (
          <ChevronRight size={20} color={palette.ink} strokeWidth={1.8} />
        )}
      </PressableFeedback>
      {open && (
        <View className="bg-surface mt-1 gap-2 rounded-2xl px-4 py-3">
          {entry.stats.map((st) => (
            <View key={st.label} className="flex-row justify-between gap-4">
              <Txt className="text-muted flex-1 text-[13px]">{st.label}</Txt>
              <Txt className="text-[13px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
                {st.value}
              </Txt>
            </View>
          ))}
          {entry.value !== null && !!myNick && (
            <View className="mt-2">
              <ChallengeButton
                challenge={{ mode: entry.mode, target: entry.value, lower: lowerIsBetter, unit }}
                result={{
                  body: formatTrainingResult({
                    me: myNick,
                    title,
                    result: entry.result,
                    stats: entry.stats,
                  }),
                  image: () =>
                    renderResultImage({
                      subtitle: `Tréning · ${title}`,
                      players: [{ name: `@${myNick}`, score: entry.score }],
                      winner: null,
                      rows: entry.stats.map((st) => ({ label: st.label, values: [st.value] })),
                    }),
                }}
              />
            </View>
          )}
          {!!myNick && (
            <View className="mt-2">
              <ShareResult
                body={formatTrainingResult({
                  me: myNick,
                  title,
                  result: entry.result,
                  stats: entry.stats,
                })}
                image={() =>
                  renderResultImage({
                    subtitle: `Tréning · ${title}`,
                    players: [{ name: `@${myNick}`, score: entry.score }],
                    winner: null,
                    rows: entry.stats.map((st) => ({ label: st.label, values: [st.value] })),
                  })
                }
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Štatistiky tréningu: súhrn z uložených tréningov + história (každý sa dá poslať). */
export function TrainingHistory({
  mode,
  title,
  lowerIsBetter = false,
  unit = '',
}: {
  mode: TrainingMode;
  title: string;
  lowerIsBetter?: boolean;
  unit?: string;
}) {
  const all = useExtraGames((s) => s.trainingHistory ?? []);
  const entries = all.filter((e) => e.mode === mode);
  const [showAll, setShowAll] = useState(false);
  if (!entries.length)
    return (
      <View className="mt-4 gap-2">
        <Heading className="text-[20px]">Štatistiky</Heading>
        <Txt className="text-muted text-[13px]">
          Po uložení prvého tréningu tu uvidíš súhrn a históriu, ktorú môžeš poslať priateľovi.
        </Txt>
      </View>
    );
  const values = entries.map((e) => e.value).filter((v): v is number => typeof v === 'number');
  const best = values.length ? (lowerIsBetter ? Math.min(...values) : Math.max(...values)) : null;
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const fmt = (v: number | null) =>
    v === null ? '–' : `${Number.isInteger(v) ? v : v.toFixed(1)}${unit ? ` ${unit}` : ''}`;
  const shown = showAll ? entries : entries.slice(0, 5);
  return (
    <View className="mt-4 gap-3">
      <Heading className="text-[20px]">Štatistiky</Heading>
      <View className="bg-surface rounded-2xl px-4 py-1">
        {[
          ['Odohrané tréningy', String(entries.length)],
          ['Najlepší výsledok', fmt(best)],
          ['Priemerný výsledok', fmt(avg)],
          ['Posledný výsledok', fmt(entries[0].value)],
        ].map(([label, value], i) => (
          <View
            key={label}
            className="flex-row justify-between gap-4 py-3"
            style={i > 0 ? { borderTopWidth: 1, borderTopColor: palette.line } : undefined}
          >
            <Txt className="flex-1">{label}</Txt>
            <Txt style={{ fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] }}>
              {value}
            </Txt>
          </View>
        ))}
      </View>
      <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>História</Txt>
      <Txt className="text-muted -mt-2 text-[12px]">
        Ťukni na tréning pre štatistiky a poslanie priateľovi.
      </Txt>
      <View>
        {shown.map((e) => (
          <EntryRow key={e.id} entry={e} title={title} lowerIsBetter={lowerIsBetter} unit={unit} />
        ))}
      </View>
      {entries.length > 5 && (
        <PressableFeedback onPress={() => setShowAll((v) => !v)} className="items-center py-2">
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>
            {showAll ? 'Zobraziť menej' : `Zobraziť všetky (${entries.length})`}
          </Txt>
        </PressableFeedback>
      )}
    </View>
  );
}

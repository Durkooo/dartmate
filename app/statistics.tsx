import { useCallback, useMemo, useState } from 'react';
import { View, FlatList } from 'react-native';
import { Button, PressableFeedback } from 'heroui-native';
import { router } from 'expo-router';
import { Send, Trophy } from 'lucide-react-native';
import { ShareResult } from '@/components/ShareResult';
import { localGameShare } from '@/lib/shareGame';
import { Heading, Txt, Empty, LoadingRows, StorageNotice } from '@/components/DartsUI';
import { OnlineError, MatchRow } from '@/components/OnlineUI';
import { palette, useDarts, type Game } from '@/lib/darts';
import { usePlayers } from '@/lib/players';
import { useOnlineQuery } from '@/lib/online';
import { StatsTrend } from '@/components/StatsTrend';
import {
  advancedStatistics,
  combinedStatistics,
  loadAccountStatistics,
  matchHistory,
  scoringTotals,
} from '@/lib/statistics';

function OfflineMatchRow({ game }: { game: Game }) {
  const myNick = usePlayers((s) => s.profile?.nickname);
  const friends = usePlayers((s) => s.friends);
  const [open, setOpen] = useState(false);
  return (
    <View className="mb-2">
      <PressableFeedback
        className="bg-ink flex-row items-center gap-3 rounded-2xl px-4 py-3"
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint="Ťukni pre poslanie výsledku priateľovi"
      >
        <Trophy size={22} color={palette.yellow} strokeWidth={1.8} />
        <View className="flex-1 gap-1">
          <Txt className="text-white" style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={2}>
            {game.solo
              ? 'Sólo hra'
              : `${game.winner === 0 ? 'Výhra' : 'Prehra'} proti ${game.opponentName}`}
          </Txt>
          <Txt className="text-on-ink text-[13px]">
            {game.starting} · {game.doubleOut ? 'Double out' : 'Straight out'} ·{' '}
            {new Date(game.date).toLocaleDateString('sk-SK')} · Offline
          </Txt>
        </View>
        {myNick ? <Send size={18} color={palette.yellow} strokeWidth={1.8} /> : null}
      </PressableFeedback>
      {open && !!myNick && (
        <View className="pt-2 pb-2">
          <ShareResult {...localGameShare(game, myNick, friends)} />
        </View>
      )}
    </View>
  );
}

export default function Statistics() {
  const userId = usePlayers((s) => s.session?.user.id);
  const ready = usePlayers((s) => s.ready);
  const localHistory = useDarts((s) => s.history);
  const hydrated = useDarts((s) => s.hydrated);
  const query = useOnlineQuery(
    userId ? `account-stats:${userId}` : null,
    useCallback(async () => (userId ? loadAccountStatistics(userId) : null), [userId]),
    60000,
  );
  const online = query.data;
  const totals = useMemo(
    () =>
      combinedStatistics(
        localHistory,
        online?.matches ?? [],
        online?.scoring ?? scoringTotals([]),
        userId ?? '',
      ),
    [localHistory, online, userId],
  );
  const advanced = useMemo(
    () => advancedStatistics(localHistory, online?.matches ?? [], online?.turns ?? []),
    [localHistory, online],
  );
  const rows = useMemo(
    () => matchHistory(localHistory, online?.matches ?? []),
    [localHistory, online],
  );
  const loading = !ready || !hydrated || query.loading;
  const unavailable = !!userId && !online && !!query.error;
  return (
    <View className="bg-background flex-1">
      <FlatList
        data={hydrated ? rows : []}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 32,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <>
            <Heading>Moje štatistiky</Heading>
            <StorageNotice />
            <OnlineError error={query.error} retry={() => void query.refresh()} />
            {loading ? (
              <LoadingRows />
            ) : unavailable ? (
              <Txt className="text-muted my-5">
                Online štatistiky nie sú dostupné. V histórii sú zatiaľ iba offline zápasy.
              </Txt>
            ) : (
              <View className="mt-5 mb-8">
                <View className="bg-ink rounded-2xl px-4 py-1">
                  {[
                    ['Zápasy', totals.matches],
                    ['Výhry', totals.wins],
                    ['Prehry', totals.losses],
                    ...(totals.solo ? [['Sólo hry', totals.solo]] : []),
                    [
                      'Priemer na 3 šípky',
                      (totals.darts ? (totals.points * 3) / totals.darts : 0).toFixed(1),
                    ],
                    ['Priemer prvých 9 šípok', advanced.first9?.toFixed(1) ?? '–'],
                    [
                      'Úspešnosť zatvorenia',
                      advanced.checkoutPct === null
                        ? '–'
                        : `${advanced.checkoutPct} % (${advanced.checkouts}/${advanced.checkoutChances})`,
                    ],
                    ['Najvyššie zatvorenie', advanced.highestCheckout || '–'],
                    ['Najlepší leg (šípky)', advanced.bestLeg ?? '–'],
                    ['Najvyšší náhod', totals.highest],
                    ['Náhody 100+', advanced.tons100],
                    ['Náhody 140+', advanced.tons140],
                    ['Náhody 180', totals.scores180],
                  ].map(([label, value], i) => (
                    <View
                      key={label}
                      className="flex-row justify-between gap-4 py-3"
                      style={
                        i > 0
                          ? { borderTopWidth: 1, borderTopColor: 'rgba(189,200,219,0.15)' }
                          : undefined
                      }
                    >
                      <Txt className="text-on-ink flex-1">{label}</Txt>
                      <Txt
                        style={{
                          fontFamily: 'Inter_700Bold',
                          fontVariant: ['tabular-nums'],
                          color: palette.yellow,
                        }}
                      >
                        {value}
                      </Txt>
                    </View>
                  ))}
                </View>
                <StatsTrend points={advanced.trend} />
                <Txt className="text-muted mt-4 text-[12px] leading-5">
                  Úspešnosť zatvorenia = zatvorené legy z hodov, keď ti ostávalo zatvorenie jednou
                  šípkou (do 40 párne alebo 50), len pri double out. Dokončené online a uložené
                  offline zápasy. Offline výsledky zostávajú na tomto zariadení.
                  {totals.solo > 0
                    ? ' Sólo hry sa rátajú do zápasov a priemeru, nie do výhier a prehier.'
                    : ''}
                </Txt>
              </View>
            )}
            {!!userId && (
              <Button
                variant="secondary"
                className="mb-6"
                onPress={() => router.push('/leaderboard')}
              >
                <Button.Label>Rebríček priateľov</Button.Label>
              </Button>
            )}
            <Heading className="text-[20px]">História zápasov</Heading>
          </>
        }
        renderItem={({ item }) =>
          item.kind === 'online' ? (
            <MatchRow match={item.match} userId={userId ?? ''} stats />
          ) : (
            <OfflineMatchRow game={item.game} />
          )
        }
        ListEmptyComponent={
          loading ? (
            <LoadingRows />
          ) : !query.error ? (
            <Empty
              text="Dokončené zápasy sa zobrazia tu."
              action="Hrať offline"
              onPress={() => router.push('/new-match')}
            />
          ) : undefined
        }
        ListFooterComponent={
          <View className="mt-5 gap-3">
            <Button variant="ghost" onPress={() => router.dismissTo('/account')}>
              <Button.Label>Späť na môj účet</Button.Label>
            </Button>
          </View>
        }
      />
    </View>
  );
}

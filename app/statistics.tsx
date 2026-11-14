import { useCallback, useMemo, useState } from 'react';
import { View, FlatList } from 'react-native';
import { Button, PressableFeedback } from 'heroui-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
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
        className="bg-surface flex-row items-center gap-3 rounded-2xl px-4 py-3"
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint="Ťukni pre poslanie výsledku priateľovi"
      >
        <Trophy size={22} color={palette.ink} strokeWidth={1.8} />
        <View className="flex-1 gap-1">
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={2}>
            {game.solo
              ? 'Sólo hra'
              : `${game.winner === 0 ? 'Výhra' : 'Prehra'} proti ${game.opponentName}`}
          </Txt>
          <Txt className="text-muted text-[13px]">
            {game.starting} · {game.doubleOut ? 'Double out' : 'Straight out'} ·{' '}
            {new Date(game.date).toLocaleDateString('sk-SK')} · Offline
          </Txt>
        </View>
        {myNick ? <Send size={18} color={palette.muted} strokeWidth={1.8} /> : null}
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
  // ?scope=offline / ?scope=online — len jeden druh zápasov (z Nového / Online zápasu);
  // bez neho (Môj účet) offline + online spolu.
  const scope = useLocalSearchParams<{ scope?: string }>().scope;
  const offlineOnly = scope === 'offline';
  const onlineOnly = scope === 'online';
  const signedInId = usePlayers((s) => s.session?.user.id);
  const userId = offlineOnly ? undefined : signedInId;
  const ready = usePlayers((s) => s.ready);
  const allLocal = useDarts((s) => s.history);
  const localHistory = useMemo(() => (onlineOnly ? [] : allLocal), [onlineOnly, allLocal]);
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
            {offlineOnly && <Stack.Screen options={{ title: 'Offline štatistiky' }} />}
            {onlineOnly && <Stack.Screen options={{ title: 'Online štatistiky' }} />}
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
                <View className="bg-surface rounded-2xl px-4 py-1">
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
                  ].map(([label, value]) => (
                    <View
                      key={label}
                      className="border-border flex-row justify-between gap-4 border-b py-3"
                    >
                      <Txt className="flex-1">{label}</Txt>
                      <Txt
                        style={{ fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] }}
                      >
                        {value}
                      </Txt>
                    </View>
                  ))}
                </View>
                <StatsTrend points={advanced.trend} />
                <Txt className="text-muted mt-4 text-[12px] leading-5">
                  Úspešnosť zatvorenia = zatvorené legy z hodov, keď ti ostávalo zatvorenie jednou
                  šípkou (do 40 párne alebo 50), len pri double out.{' '}
                  {offlineOnly
                    ? 'Len offline zápasy z tohto zariadenia.'
                    : onlineOnly
                      ? 'Len dokončené online zápasy.'
                      : 'Dokončené online a uložené offline zápasy. Offline výsledky zostávajú na tomto zariadení.'}
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
              action={onlineOnly ? 'Online zápasy' : 'Hrať offline'}
              onPress={() => router.push(onlineOnly ? '/online' : '/new-match')}
            />
          ) : undefined
        }
        ListFooterComponent={
          <View className="mt-5 gap-3">
            {offlineOnly || onlineOnly ? (
              <Button variant="ghost" onPress={() => router.back()}>
                <Button.Label>{offlineOnly ? 'Späť na nový zápas' : 'Späť'}</Button.Label>
              </Button>
            ) : (
              <Button variant="ghost" onPress={() => router.dismissTo('/account')}>
                <Button.Label>Späť na môj účet</Button.Label>
              </Button>
            )}
          </View>
        }
      />
    </View>
  );
}

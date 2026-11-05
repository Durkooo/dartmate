import { useCallback, useState } from 'react';
import { View, FlatList } from 'react-native';
import { Button } from 'heroui-native';
import { router, useFocusEffect } from 'expo-router';
import { Heading, Txt, Empty, LoadingRows } from '@/components/DartsUI';
import { OnlineGate, OnlineError, MatchRow } from '@/components/OnlineUI';
import { bilt } from '@/lib/bilt';
import { feedback } from '@/lib/darts';
import { playerError, usePlayers } from '@/lib/players';
import { loadStatistics, useOnlineQuery, type OnlineMatch } from '@/lib/online';

export default function Statistics() {
  const userId = usePlayers((s) => s.session?.user.id);
  const query = useOnlineQuery(
    userId ? `stats:${userId}` : null,
    useCallback(() => loadStatistics(), []),
    10000,
  );
  const [history, setHistory] = useState<{
    userId: string;
    rows: OnlineMatch[];
    hasMore: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const load = useCallback(
    async (reset = false) => {
      if (!userId) return;
      setPending(true);
      setError('');
      try {
        const last = !reset && history?.userId === userId ? history.rows.at(-1) : undefined;
        let request = bilt
          .from('online_matches')
          .select('*')
          .eq('status', 'finished')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(30);
        if (last)
          request = request.or(
            `created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`,
          );
        const { data, error: e } = await request;
        if (e) throw new Error(e.message);
        if (usePlayers.getState().session?.user.id !== userId) return;
        setHistory((s) => ({
          userId,
          rows: reset || s?.userId !== userId ? (data ?? []) : [...s.rows, ...(data ?? [])],
          hasMore: (data?.length ?? 0) === 30,
        }));
      } catch (e) {
        setError(
          playerError({
            message: e instanceof Error ? e.message : 'Históriu sa nepodarilo načítať.',
          }),
        );
        feedback.error();
      } finally {
        setPending(false);
      }
    },
    [userId, history],
  );
  useFocusEffect(
    useCallback(() => {
      if (!userId) return undefined;
      let active = true;
      setPending(true);
      setError('');
      void Promise.resolve(
        bilt
          .from('online_matches')
          .select('*')
          .eq('status', 'finished')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(30),
      )
        .then(({ data, error: e }) => {
          if (!active || usePlayers.getState().session?.user.id !== userId) return;
          if (e) {
            setError(playerError(e));
            feedback.error();
          } else setHistory({ userId, rows: data ?? [], hasMore: (data?.length ?? 0) === 30 });
          setPending(false);
        })
        .catch((e: unknown) => {
          if (!active || usePlayers.getState().session?.user.id !== userId) return;
          setError(
            playerError({
              message: e instanceof Error ? e.message : 'Históriu sa nepodarilo načítať.',
            }),
          );
          feedback.error();
          setPending(false);
        });
      return () => {
        active = false;
      };
    }, [userId]),
  );
  const stats = query.data;
  const rows = history && history.userId === userId ? history.rows : [];
  return (
    <View className="bg-background flex-1">
      <FlatList
        data={rows}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 32,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <OnlineGate>
            <Heading>Moje štatistiky</Heading>
            <OnlineError error={query.error} retry={() => void query.refresh()} />
            {query.loading ? (
              <LoadingRows />
            ) : (
              stats && (
                <View className="mt-5 mb-8">
                  {[
                    ['Zápasy', stats.matches ?? 0],
                    ['Výhry', stats.wins ?? 0],
                    ['Prehry', stats.losses ?? 0],
                    ['Priemer na 3 šípky', (stats.three_dart_average ?? 0).toFixed(1)],
                    ['Najvyšší náhod', stats.highest_score ?? 0],
                    ['Náhody 180', stats.scores_180 ?? 0],
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
                  <Txt className="text-muted mt-4 text-[12px] leading-5">
                    Počítajú sa dokončené online zápasy. Prehodený ťah má 0 bodov; pri ukončení sa
                    zohľadní počet šípok.
                  </Txt>
                </View>
              )
            )}
            <Heading className="text-[20px]">História zápasov</Heading>
            <OnlineError error={error} retry={() => void load(!rows.length)} />
          </OnlineGate>
        }
        renderItem={({ item }) => <MatchRow match={item} userId={userId ?? ''} />}
        ListEmptyComponent={
          userId ? (
            pending || (!history && !error) ? (
              <LoadingRows />
            ) : !error && !query.error ? (
              <Empty
                text="Dokončené online zápasy sa zobrazia tu."
                action="Pozvať priateľa"
                onPress={() => router.push('/online/new')}
              />
            ) : undefined
          ) : undefined
        }
        ListFooterComponent={
          <View className="mt-5 gap-3">
            {history && history.userId === userId && history.hasMore && (
              <Button variant="secondary" isDisabled={pending} onPress={() => void load()}>
                <Button.Label>{pending ? 'Načítavam…' : 'Staršie zápasy'}</Button.Label>
              </Button>
            )}
            <Button variant="ghost" onPress={() => router.dismissTo('/')}>
              <Button.Label>Späť domov</Button.Label>
            </Button>
          </View>
        }
      />
    </View>
  );
}

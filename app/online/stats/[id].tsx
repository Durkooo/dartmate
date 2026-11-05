import { useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Heading, Txt, LoadingRows } from '@/components/DartsUI';
import { OnlineGate, OnlineError } from '@/components/OnlineUI';
import {
  computeMatchStats,
  loadMatch,
  opponentName,
  useOnlineQuery,
  type MatchPlayerStats,
} from '@/lib/online';
import { usePlayers } from '@/lib/players';

const STAT_LABELS: { key: keyof MatchPlayerStats; label: string }[] = [
  { key: 'tons80', label: '80+' },
  { key: 'tons100', label: '100+' },
  { key: 'tons140', label: '140+' },
  { key: 'tons170', label: '170+' },
  { key: 'count180', label: '180' },
  { key: 'avg3', label: 'Priemer' },
  { key: 'avg9', label: 'Priemer prvých 9' },
  { key: 'bestLeg', label: 'Najlepší leg' },
];

function StatRow({
  label,
  mine,
  peer,
}: {
  label: string;
  mine: number | null;
  peer: number | null;
}) {
  const text = (v: number | null) => (v === null ? '–' : String(v));
  return (
    <View className="flex-row items-baseline py-2.5">
      <Txt numberOfLines={1} className="flex-1 text-left text-[17px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
        {text(mine)}
      </Txt>
      <Txt className="text-muted px-3 text-[13px]">{label}</Txt>
      <Txt numberOfLines={1} className="flex-1 text-right text-[17px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
        {text(peer)}
      </Txt>
    </View>
  );
}

export default function MatchStats() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const userId = usePlayers((s) => s.session?.user.id);
  const query = useOnlineQuery(
    userId ? `matchstats:${userId}:${id}` : null,
    useCallback(() => loadMatch(id), [id]),
  );
  const match = query.data?.match ?? null;
  const turns = query.data?.turns ?? [];
  const peerId =
    match && userId
      ? match.host_id === userId
        ? match.guest_id
        : match.host_id
      : '';
  const me = userId ? computeMatchStats(turns, userId) : null;
  const rival = computeMatchStats(turns, peerId);
  const won = match && userId ? match.winner_id === userId : false;
  return (
    <Page>
      <Stack.Screen options={{ title: 'Štatistiky zápasu' }} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32, maxWidth: 600, width: '100%', alignSelf: 'center', flexGrow: 1 }}
      >
        <Heading className="text-center">Štatistiky zápasu</Heading>
        <OnlineError error={query.error} retry={() => void query.refresh()} />
        <OnlineGate>
          {query.loading ? (
            <LoadingRows />
          ) : !query.error && match && me ? (
            <View>
              <Txt className="text-muted mt-2 text-center text-[13px]">
                {won ? 'Výhra' : 'Prehra'} · @{match && userId ? opponentName(match, userId) : ''} ·{' '}
                {match.starting}
                {match.doubleOut ? ' · Double out' : ''}
              </Txt>
              <View className="mt-6 flex-row items-baseline">
                <Txt numberOfLines={1} className="flex-1 text-left text-[15px]" style={{ fontFamily: 'Inter_700Bold' }}>
                  Ty
                </Txt>
                <Txt numberOfLines={1} className="flex-1 text-right text-[15px]" style={{ fontFamily: 'Inter_700Bold' }}>
                  @{match && userId ? opponentName(match, userId) : ''}
                </Txt>
              </View>
              <View className="mt-2">
                {STAT_LABELS.map((s) => (
                  <StatRow key={s.key} label={s.label} mine={me[s.key]} peer={rival[s.key]} />
                ))}
              </View>
              <Txt className="text-muted mt-4 text-center text-[12px]">
                Priemer ráta aj pokazené hody.
              </Txt>
              <Button variant="ghost" className="mt-6" onPress={() => router.dismissTo('/')}>
                <Button.Label>Späť domov</Button.Label>
              </Button>
            </View>
          ) : !query.error ? (
            <Txt className="text-muted mt-6 text-center">Štatistiky nie sú k dispozícii.</Txt>
          ) : null}
        </OnlineGate>
      </ScrollView>
    </Page>
  );
}

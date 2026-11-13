import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Heading, Txt, LoadingRows, Avatar } from '@/components/DartsUI';
import { OnlineError, OnlineGate } from '@/components/OnlineUI';
import { palette, CARD_ROW } from '@/lib/darts';
import { useOnlineQuery } from '@/lib/online';
import { usePlayers } from '@/lib/players';
import { loadLeaderboard, type LeaderRow } from '@/lib/statistics';

type Period = 'month' | 'all';
type Sort = 'avg' | 'wins';

function sinceOf(period: Period) {
  if (period === 'all') return '2000-01-01T00:00:00Z';
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export default function Leaderboard() {
  const userId = usePlayers((s) => s.session?.user.id);
  const friends = usePlayers((s) => s.friends);
  const myAvatar = usePlayers((s) => s.myAvatarUrl);
  const [period, setPeriod] = useState<Period>('month');
  const [sort, setSort] = useState<Sort>('avg');
  const query = useOnlineQuery(
    userId ? `leaderboard:${userId}:${period}` : null,
    useCallback(() => loadLeaderboard(sinceOf(period)), [period]),
    60000,
  );
  const rows = [...(query.data ?? [])]
    .filter((r) => r.matches > 0)
    .sort((a: LeaderRow, b: LeaderRow) =>
      sort === 'avg'
        ? (b.avg ?? -1) - (a.avg ?? -1) || b.wins - a.wins
        : b.wins - a.wins || (b.avg ?? -1) - (a.avg ?? -1),
    );
  return (
    <Page>
      <Stack.Screen options={{ title: 'Rebríček' }} />
      <OnlineGate>
        <View className="mt-3 gap-4">
          <Heading>Rebríček priateľov</Heading>
          <View className="flex-row gap-2">
            {(
              [
                ['month', 'Tento mesiac'],
                ['all', 'Celkovo'],
              ] as const
            ).map(([p, label]) => (
              <Button
                key={p}
                size="sm"
                className="flex-1"
                variant={period === p ? 'secondary' : 'tertiary'}
                onPress={() => setPeriod(p)}
              >
                <Button.Label>{label}</Button.Label>
              </Button>
            ))}
          </View>
          <View className="flex-row gap-2">
            {(
              [
                ['avg', 'Podľa priemeru'],
                ['wins', 'Podľa výhier'],
              ] as const
            ).map(([s, label]) => (
              <Button
                key={s}
                size="sm"
                className="flex-1"
                variant={sort === s ? 'primary' : 'ghost'}
                onPress={() => setSort(s)}
              >
                <Button.Label>{label}</Button.Label>
              </Button>
            ))}
          </View>
          <OnlineError error={query.error} retry={() => void query.refresh()} />
          {query.loading ? (
            <LoadingRows />
          ) : query.data === null && !query.error ? (
            <Txt className="text-muted">
              Rebríček sa pripravuje — zobrazí sa po aktualizácii servera.
            </Txt>
          ) : !rows.length ? (
            <Txt className="text-muted">
              {period === 'month'
                ? 'Tento mesiac ešte nikto z vás nedohral online zápas.'
                : 'Zatiaľ nikto z vás nedohral online zápas.'}
            </Txt>
          ) : (
            <View>
              {rows.map((r, i) => {
                const me = r.userId === userId;
                const friend = friends.find((f) => f.id === r.userId);
                return (
                  <View
                    key={r.userId}
                    className={CARD_ROW}
                    style={me ? { borderWidth: 2, borderColor: palette.ink } : undefined}
                  >
                    <Txt
                      className="w-7 text-center"
                      style={{ fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}
                    >
                      {i + 1}.
                    </Txt>
                    <Avatar
                      friend={{
                        name: r.nickname,
                        color: 'blue',
                        avatarUrl: me ? myAvatar : friend?.avatarUrl,
                      }}
                      size={36}
                    />
                    <View className="flex-1">
                      <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
                        @{r.nickname}
                        {me ? ' (ty)' : ''}
                      </Txt>
                      <Txt className="text-muted text-[12px]">
                        Zápasy {r.matches} · výhry {r.wins}
                      </Txt>
                    </View>
                    <Txt
                      style={{
                        fontFamily: 'Inter_700Bold',
                        fontSize: 18,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {sort === 'avg' ? (r.avg?.toFixed(1) ?? '–') : r.wins}
                    </Txt>
                  </View>
                );
              })}
              <Txt className="text-muted mt-3 text-[12px]">
                Dohrané online zápasy (proti komukoľvek). Priemer na 3 šípky ráta aj pokazené hody.
              </Txt>
            </View>
          )}
        </View>
      </OnlineGate>
    </Page>
  );
}

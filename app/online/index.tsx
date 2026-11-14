import { useCallback } from 'react';
import { View, FlatList } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { Target } from 'lucide-react-native';
import { Txt, LoadingRows } from '@/components/DartsUI';
import { OnlineGate, OnlineError, MatchRow } from '@/components/OnlineUI';
import { loadOpenMatches, useOnlineQuery } from '@/lib/online';
import { palette } from '@/lib/darts';
import { usePlayers } from '@/lib/players';

export default function OnlineLobby() {
  const userId = usePlayers((s) => s.session?.user.id);
  const query = useOnlineQuery(
    userId ? `lobby:${userId}` : null,
    useCallback(() => loadOpenMatches(), []),
  );
  return (
    <View className="bg-background flex-1">
      <FlatList
        data={query.data ?? []}
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
          <View className="mt-3 mb-5 gap-4">
            <OnlineError error={query.error} retry={() => void query.refresh()} />
            <Txt className="text-muted text-[13px]">Pozvánky a rozhrané zápasy</Txt>
          </View>
        }
        renderItem={({ item }) => <MatchRow match={item} userId={userId ?? ''} />}
        ListEmptyComponent={
          <OnlineGate>
            {query.loading ? (
              <LoadingRows />
            ) : !query.error ? (
              <View className="items-center gap-4 py-10">
                <Target color={palette.muted} size={32} strokeWidth={1.8} />
                <Txt className="text-muted text-center">
                  Pozvi priateľa a počkaj na jeho prijatie.
                </Txt>
                <Button className="w-full" onPress={() => router.push('/online/new')}>
                  <Button.Label>Pozvať priateľa na zápas</Button.Label>
                </Button>
              </View>
            ) : null}
          </OnlineGate>
        }
        ListFooterComponent={
          <View className="mt-6 gap-2">
            {query.data && query.data.length > 0 && (
              <Button onPress={() => router.push('/online/new')}>
                <Button.Label>Pozvať priateľa na zápas</Button.Label>
              </Button>
            )}
            <Button
              variant="secondary"
              onPress={() => router.push({ pathname: '/statistics', params: { scope: 'online' } })}
            >
              <Button.Label>Online štatistiky</Button.Label>
            </Button>
            <Button variant="ghost" onPress={() => router.dismissTo('/')}>
              <Button.Label>Späť domov</Button.Label>
            </Button>
          </View>
        }
      />
    </View>
  );
}

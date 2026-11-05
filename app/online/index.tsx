import { useCallback } from 'react';
import { View, FlatList } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { Heading, Txt, Empty, LoadingRows } from '@/components/DartsUI';
import { OnlineGate, OnlineError, MatchRow } from '@/components/OnlineUI';
import { loadOpenMatches, useOnlineQuery } from '@/lib/online';
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
          <View className="mb-5 gap-4">
            <Heading>Hráme spolu</Heading>
            <Button onPress={() => router.push('/online/new')}>
              <Button.Label>Pozvať priateľa</Button.Label>
            </Button>
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
              <Empty
                text="Pozvi priateľa a počkaj na jeho prijatie."
                action="Vybrať priateľa"
                onPress={() => router.push('/online/new')}
              />
            ) : null}
          </OnlineGate>
        }
        ListFooterComponent={
          <View className="mt-6 gap-2">
            <Button variant="secondary" onPress={() => router.push('/statistics')}>
              <Button.Label>Moje štatistiky</Button.Label>
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

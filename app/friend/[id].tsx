import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Heading, Txt, Avatar, LoadingRows, Empty } from '@/components/DartsUI';
import { usePlayers, playerError } from '@/lib/players';
import { bilt } from '@/lib/bilt';
import { feedback } from '@/lib/darts';

export default function PlayerFriend() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = usePlayers((s) => s.session);
  const ready = usePlayers((s) => s.ready);
  const friends = usePlayers((s) => s.friends);
  const loading = usePlayers((s) => s.loading);
  const remoteError = usePlayers((s) => s.error);
  const refresh = usePlayers((s) => s.refresh);
  const friend = friends.find((f) => f.id === id);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const remove = async () => {
    if (!session || !friend) return;
    setPending(true);
    setError('');
    try {
      const { error: e } = await bilt
        .from('player_friends')
        .delete()
        .eq('owner_id', session.user.id)
        .eq('friend_id', friend.id);
      if (e) {
        setError(playerError(e));
        feedback.error();
        return;
      }
      await refresh();
      feedback.success();
      router.dismissTo('/friends');
    } catch (e) {
      setError(playerError({ message: e instanceof Error ? e.message : 'Pripojenie zlyhalo.' }));
      feedback.error();
    } finally {
      setPending(false);
    }
  };
  return (
    <Page fallbackHref="/friends" fallbackLabel="Späť k priateľom">
      <Stack.Screen options={{ title: 'Priateľ' }} />
      {!ready || (loading && !friend) ? (
        <LoadingRows />
      ) : remoteError ? (
        <View className="gap-4">
          <Txt className="text-danger">{remoteError}</Txt>
          <Button onPress={() => void refresh()}>
            <Button.Label>Skúsiť znova</Button.Label>
          </Button>
        </View>
      ) : !friend ? (
        <Empty
          text="Tohto hráča nemáš medzi priateľmi."
          action="Otvoriť priateľov"
          onPress={() => router.replace('/friends')}
        />
      ) : (
        <View className="mt-4 gap-5">
          <Avatar friend={friend} size={64} />
          <Heading>@{friend.handle}</Heading>
          <Txt className="text-muted">
            Priateľ je uložený v tvojom účte. Online zápasy, správy a videohovory zatiaľ nie sú
            dostupné.
          </Txt>
          <Button
            onPress={() => router.push({ pathname: '/new-match', params: { friendId: friend.id } })}
          >
            <Button.Label>Lokálny zápas</Button.Label>
          </Button>
          {confirm ? (
            <View className="gap-3">
              <Txt>Odobrať @{friend.handle} z priateľov?</Txt>
              <Button variant="danger" isDisabled={pending} onPress={remove}>
                <Button.Label>{pending ? 'Odoberám…' : 'Odobrať priateľa'}</Button.Label>
              </Button>
              <Button variant="ghost" isDisabled={pending} onPress={() => setConfirm(false)}>
                <Button.Label>Zrušiť</Button.Label>
              </Button>
            </View>
          ) : (
            <Button variant="ghost" onPress={() => setConfirm(true)}>
              <Button.Label>Odobrať priateľa</Button.Label>
            </Button>
          )}
          {!!error && (
            <Txt className="text-danger" accessibilityRole="alert">
              {error}
            </Txt>
          )}
        </View>
      )}
    </Page>
  );
}

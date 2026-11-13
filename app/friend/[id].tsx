import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Heading, Txt, Avatar, LoadingRows, Empty } from '@/components/DartsUI';
import { usePlayers, playerError } from '@/lib/players';
import { bilt } from '@/lib/bilt';
import { feedback, palette, useDarts } from '@/lib/darts';
import { loadHeadToHead } from '@/lib/statistics';
import { loadContacts, useOnlineQuery } from '@/lib/online';
import { OnlineError, Presence } from '@/components/OnlineUI';

export default function PlayerFriend() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = usePlayers((s) => s.session);
  const ready = usePlayers((s) => s.ready);
  const friends = usePlayers((s) => s.friends);
  const loading = usePlayers((s) => s.loading);
  const remoteError = usePlayers((s) => s.error);
  const refresh = usePlayers((s) => s.refresh);
  const friend = friends.find((f) => f.id === id);
  const social = useOnlineQuery(
    session ? `friend:${session.user.id}:${id}` : null,
    useCallback(() => loadContacts(), []),
  );
  const localHistory = useDarts((s) => s.history);
  const h2h = useOnlineQuery(
    session ? `h2h:${session.user.id}:${id}:${localHistory.length}` : null,
    useCallback(
      () => (session ? loadHeadToHead(session.user.id, id, localHistory) : Promise.resolve(null)),
      [session, id, localHistory],
    ),
    60000,
  );
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
          <Presence
            online={!!social.data?.find((c: any) => c.user_id === id)?.online}
            playing={!!social.data?.find((c: any) => c.user_id === id)?.in_match}
            unknown={social.loading || !!social.error}
            lastSeen={social.data?.find((c: any) => c.user_id === id)?.last_seen ?? null}
          />
          <OnlineError error={social.error} retry={() => void social.refresh()} />
          {!!h2h.data && h2h.data.matches > 0 && (
            <View className="bg-ink gap-3 rounded-2xl p-4">
              <Txt className="text-white" style={{ fontFamily: 'Inter_600SemiBold' }}>
                Ty vs @{friend.handle}
              </Txt>
              <Txt
                style={{
                  fontFamily: 'Inter_600SemiBold',
                  fontSize: 32,
                  fontVariant: ['tabular-nums'],
                  color: palette.yellow,
                }}
                accessibilityLabel={`Výhry ${h2h.data.wins}, prehry ${h2h.data.losses}`}
              >
                {h2h.data.wins} : {h2h.data.losses}
              </Txt>
              {[
                ['Zápasy', String(h2h.data.matches)],
                ['Legy', `${h2h.data.legsWon} : ${h2h.data.legsLost}`],
                [
                  'Priemer na 3 šípky',
                  `${h2h.data.avg[0]?.toFixed(1) ?? '–'} : ${h2h.data.avg[1]?.toFixed(1) ?? '–'}`,
                ],
                ['Náhody 180', `${h2h.data.count180[0]} : ${h2h.data.count180[1]}`],
              ].map(([label, value]) => (
                <View key={label} className="flex-row justify-between gap-4">
                  <Txt className="text-on-ink">{label}</Txt>
                  <Txt
                    className="text-white"
                    style={{ fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] }}
                  >
                    {value}
                  </Txt>
                </View>
              ))}
              <Txt className="text-on-ink text-[12px]">
                Ty vľavo, @{friend.handle} vpravo. Online zápasy medzi vami a lokálne zápasy na
                tomto telefóne.
              </Txt>
            </View>
          )}
          <Button
            onPress={() =>
              router.push({ pathname: '/conversation/[id]', params: { id: friend.id } })
            }
          >
            <Button.Label>Napísať správu</Button.Label>
          </Button>
          <Button
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/online/new', params: { friendId: friend.id } })
            }
          >
            <Button.Label>Pozvať na online zápas</Button.Label>
          </Button>
          <Button
            variant="outline"
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

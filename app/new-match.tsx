import { useState } from 'react';
import { View, FlatList } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Button, PressableFeedback } from 'heroui-native';
import { Check, Target, ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Page, Heading, Txt, Avatar, LoadingRows, StorageNotice } from '@/components/DartsUI';
import { feedback, palette, useDarts, type Friend } from '@/lib/darts';
import { usePlayers } from '@/lib/players';

const practice: Friend = {
  id: 'practice',
  name: 'Tréningový hráč',
  handle: 'trening',
  color: 'blue',
  demo: false,
};
export default function NewMatch() {
  const { friendId } = useLocalSearchParams<{ friendId?: string }>();
  const localFriends = useDarts((s) => s.friends);
  const remoteFriends = usePlayers((s) => s.friends);
  const friends = [...remoteFriends, ...localFriends];
  const game = useDarts((s) => s.game);
  const hydrated = useDarts((s) => s.hydrated);
  const startGame = useDarts((s) => s.startGame);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(friendId ?? friends[0]?.id ?? 'practice');
  const [starting, setStarting] = useState<301 | 501>(501);
  const [doubleOut, setDoubleOut] = useState(true);
  const [legsToWin, setLegsToWin] = useState(2);
  const [replace, setReplace] = useState(false);
  const opponent = friends.find((f) => f.id === selected) ?? practice;
  if (!hydrated)
    return (
      <Page>
        <Stack.Screen options={{ title: 'Nový zápas' }} />
        <LoadingRows />
      </Page>
    );
  return (
    <View className="bg-background flex-1">
      <Stack.Screen options={{ title: 'Nový zápas' }} />
      <FlatList
        data={[...friends, practice]}
        keyExtractor={(friend) => friend.id}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: Math.max(insets.bottom, 32),
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View>
            <StorageNotice />
            <Heading className="mt-2 mb-4">S kým hráš?</Heading>
            <Txt className="text-muted mb-4 text-[13px]">
              Lokálny zápas · skóre zadávaš za oboch hráčov
            </Txt>
          </View>
        }
        renderItem={({ item: friend }) => (
          <PressableFeedback
            onPress={() => {
              if (selected !== friend.id) {
                setSelected(friend.id);
                feedback.selection();
              }
            }}
            className={`mb-2 flex-row items-center gap-3 rounded-xl p-3 ${selected === friend.id ? 'bg-surface' : ''}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === friend.id }}
          >
            <Avatar friend={friend} size={42} />
            <View className="flex-1">
              <Txt style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
                {friend.id === 'practice' ? 'Dvaja pri jednom terči' : friend.name}
              </Txt>
              {friend.demo && <Txt className="text-muted mt-1 text-[12px]">Ukážkový hráč</Txt>}
            </View>
            {selected === friend.id && <Check size={22} color={palette.ink} strokeWidth={1.8} />}
          </PressableFeedback>
        )}
        ListFooterComponent={
          <View>
            <Heading className="mt-7 mb-4 text-[20px]">Hra</Heading>
            <View className="flex-row gap-3">
              {([301, 501] as const).map((n) => (
                <Button
                  key={n}
                  className="h-16 flex-1 rounded-xl"
                  variant={starting === n ? 'primary' : 'secondary'}
                  onPress={() => {
                    if (starting !== n) {
                      setStarting(n);
                      feedback.selection();
                    }
                  }}
                >
                  <Button.Label className="text-[24px]" style={{ fontFamily: 'Inter_700Bold' }}>
                    {n}
                  </Button.Label>
                </Button>
              ))}
            </View>
            <Heading className="mt-7 mb-4 text-[20px]">Na koľko víťazných legov?</Heading>
            <View className="flex-row gap-3">
              {([1, 2, 3, 5] as const).map((n) => (
                <Button
                  key={n}
                  className="h-16 flex-1 rounded-xl"
                  variant={legsToWin === n ? 'primary' : 'secondary'}
                  onPress={() => {
                    if (legsToWin !== n) {
                      setLegsToWin(n);
                      feedback.selection();
                    }
                  }}
                >
                  <Button.Label className="text-[24px]" style={{ fontFamily: 'Inter_700Bold' }}>
                    {n}
                  </Button.Label>
                </Button>
              ))}
            </View>
            <Txt className="text-muted mt-3 mb-7 text-[13px]">
              {legsToWin === 1
                ? 'Jeden leg — kto prvý ukončí hru, vyhráva zápas.'
                : `Zápas končí, keď niekto vyhrá ${legsToWin} ${legsToWin === 5 ? 'legov' : 'legy'}. Jeden leg = jedna hra ${starting}.`}
            </Txt>
            <Heading className="mt-7 mb-4 text-[20px]">Ukončenie hry</Heading>
            <View className="flex-row gap-3">
              {[true, false].map((d) => (
                <Button
                  key={String(d)}
                  className="flex-1 rounded-xl"
                  variant={doubleOut === d ? 'primary' : 'secondary'}
                  onPress={() => {
                    if (doubleOut !== d) {
                      setDoubleOut(d);
                      feedback.selection();
                    }
                  }}
                >
                  <Button.Label numberOfLines={1}>{d ? 'Double out' : 'Straight out'}</Button.Label>
                </Button>
              ))}
            </View>
            <Txt className="text-muted mt-3 mb-7 text-[13px]">
              {doubleOut
                ? 'Posledná šípka musí trafiť double alebo bull za 50.'
                : 'Na výhru stačí znížiť skóre presne na nulu.'}
            </Txt>
            {game && !replace ? (
              <View className="gap-3">
                <Txt>
                  {game.winner !== null
                    ? 'Máš dohraný zápas, ktorý čaká na uloženie.'
                    : 'Máš rozhraný zápas.'}
                </Txt>
                <Button onPress={() => router.push('/match')}>
                  <Button.Label>
                    {game.winner !== null ? 'Zobraziť výsledok' : 'Pokračovať v zápase'}
                  </Button.Label>
                  <ChevronRight size={20} color={palette.ink} />
                </Button>
                <Button variant="ghost" onPress={() => setReplace(true)}>
                  <Button.Label>Začať odznova</Button.Label>
                </Button>
              </View>
            ) : (
              <View className="gap-3">
                {replace && (
                  <Txt className="text-danger text-[13px]">
                    Začatím nového zápasu zahodíš predchádzajúci zápas.
                  </Txt>
                )}
                <Button
                  size="lg"
                  onPress={() => {
                    startGame(opponent, starting, doubleOut, legsToWin);
                    feedback.success();
                    router.replace('/match');
                  }}
                >
                  <Target size={20} color={palette.ink} strokeWidth={1.8} />
                  <Button.Label>Začať zápas</Button.Label>
                </Button>
              </View>
            )}
            <Button className="mt-5" variant="ghost" onPress={() => router.dismissTo('/')}>
              <Button.Label>Späť na hru</Button.Label>
            </Button>
          </View>
        }
      />
    </View>
  );
}

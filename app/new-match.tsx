import { useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Accordion, Button, Input, PressableFeedback } from 'heroui-native';
import { Check, Target, ChevronRight, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Page, Heading, Txt, Avatar, LoadingRows, StorageNotice } from '@/components/DartsUI';
import { LegPicker } from '@/components/LegPicker';
import { feedback, palette, useDarts, type Friend } from '@/lib/darts';
import { usePlayers } from '@/lib/players';
import { BOTS, type BotId } from '@/lib/bots';
import { newCricket, useExtraGames } from '@/lib/games';

const soloFriend: Friend = {
  id: 'solo',
  name: 'Hrám sám',
  handle: 'sam',
  color: 'peach',
  demo: false,
};
/** Spustenie Cricketu (hrajú vždy dvaja; bez legov a double out). */
function CricketStart({
  opponent,
  twoPlayers,
  running,
  onStart,
}: {
  opponent: Friend;
  twoPlayers: boolean;
  running: boolean;
  onStart: () => void;
}) {
  const [replace, setReplace] = useState(false);
  return (
    <View className="mt-4 mb-2 gap-3">
      <Txt className="text-muted text-[13px] leading-5">
        Zavri 20 až 15 a bull trojicou zásahov (double = 2, triple = 3). Zásahy navyše do zavretého
        čísla dávajú body, kým ho nezavrie aj súper. Vyhrá, kto zavrie všetko a má aspoň toľko bodov
        ako súper.
      </Txt>
      {!twoPlayers ? (
        <Txt className="text-danger text-[13px]">
          Cricket hrajú dvaja — vyber priateľa alebo napíš meno súpera hore.
        </Txt>
      ) : running && !replace ? (
        <>
          <Txt>Máš rozohraný Cricket.</Txt>
          <Button onPress={() => router.push('/games/cricket')}>
            <Button.Label>Pokračovať v Crickete</Button.Label>
            <ChevronRight size={20} color={palette.ink} />
          </Button>
          <Button variant="ghost" onPress={() => setReplace(true)}>
            <Button.Label>Začať odznova</Button.Label>
          </Button>
        </>
      ) : (
        <>
          {replace && (
            <Txt className="text-danger text-[13px]">
              Začatím novej hry zahodíš rozohraný Cricket.
            </Txt>
          )}
          <Button size="lg" onPress={onStart}>
            <Target size={20} color={palette.ink} strokeWidth={1.8} />
            <Button.Label>Začať Cricket proti {opponent.name}</Button.Label>
          </Button>
        </>
      )}
    </View>
  );
}

export default function NewMatch() {
  const { friendId } = useLocalSearchParams<{ friendId?: string }>();
  const localFriends = useDarts((s) => s.friends);
  const remoteFriends = usePlayers((s) => s.friends);
  // Ukážkoví hráči do offline zápasu nepatria — len ozajstní súperi.
  const friends = [...remoteFriends, ...localFriends].filter((f) => !f.demo);
  const [tempName, setTempName] = useState('');
  const game = useDarts((s) => s.game);
  const hydrated = useDarts((s) => s.hydrated);
  const startGame = useDarts((s) => s.startGame);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(
    // Bez vybraného priateľa (z profilu) začíname „Hrám sám“ — zoznam priateľov je zbalený.
    friends.find((friend) => friend.id === friendId)?.id ?? 'solo',
  );
  // Priatelia sa môžu načítať až po otvorení (zo servera) — vyber ho, keď sa objaví.
  const [preselected, setPreselected] = useState(selected !== 'solo' || !friendId);
  if (!preselected && friendId && friends.some((f) => f.id === friendId)) {
    setPreselected(true);
    setSelected(friendId);
  }
  const [starting, setStarting] = useState<301 | 501>(501);
  // Druh hry: 301/501 (x01) alebo Cricket.
  const [mode, setMode] = useState<'x01' | 'cricket'>('x01');
  const cricketGame = useExtraGames((s) => s.cricket);
  const setCricket = useExtraGames((s) => s.setCricket);
  const [doubleOut, setDoubleOut] = useState(true);
  const [legsToWin, setLegsToWin] = useState(2);
  const [replace, setReplace] = useState(false);
  const [botId, setBotId] = useState<BotId>('novice');
  const [botExpanded, setBotExpanded] = useState(false);
  // Priatelia v rozbaľovacom zozname (ako boti); otvorený, ak je priateľ už vybraný.
  const [friendsExpanded, setFriendsExpanded] = useState(() =>
    friends.some((f) => f.id === friendId),
  );
  const selectedBot = BOTS.find((bot) => bot.id === botId) ?? BOTS[0];
  const botOpponent: Friend = {
    id: `bot-${selectedBot.id}`,
    name: selectedBot.name,
    handle: selectedBot.id,
    color: 'lavender',
    demo: false,
  };
  const trimmed = tempName.trim();
  // Dočasný súper sa nikam neukladá — po zápase zmizne, zápas ostane v histórii.
  const tempOpponent: Friend = {
    id: `temp-${trimmed}`,
    name: trimmed,
    handle: trimmed,
    color: 'peach',
    demo: false,
  };
  const opponent =
    selected === 'bot'
      ? botOpponent
      : selected === 'solo'
        ? soloFriend
        : trimmed
          ? tempOpponent
          : (friends.find((f) => f.id === selected) ?? soloFriend);
  if (!hydrated)
    return (
      <Page>
        <Stack.Screen options={{ title: 'Nový zápas' }} />
        <LoadingRows />
      </Page>
    );
  return (
    <KeyboardAvoidingView
      className="bg-background flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: 'Nový zápas' }} />
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={trimmed ? [tempOpponent, soloFriend] : [soloFriend]}
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
            {selected !== 'bot' && (
              <>
                <Input
                  value={tempName}
                  onChangeText={(name) => {
                    setTempName(name);
                    if (selected === 'solo' && name.trim()) setSelected('temporary');
                    if (selected === 'temporary' && !name.trim()) setSelected('solo');
                  }}
                  placeholder="Meno dočasného súpera…"
                  accessibilityLabel="Meno dočasného súpera"
                  className="rounded-xl"
                />
                <Txt className="text-muted mt-2 mb-4 text-[12px]">
                  Dočasný súper sa neuloží medzi priateľov.
                </Txt>
              </>
            )}
          </View>
        }
        renderItem={({ item: friend }) => (
          <View>
            <PressableFeedback
              onPress={() => {
                if (tempName) setTempName('');
                if (selected !== friend.id) {
                  setSelected(friend.id);
                  feedback.selection();
                }
              }}
              className={`mb-2 flex-row items-center gap-3 rounded-xl p-3 ${opponent.id === friend.id ? 'bg-surface' : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: opponent.id === friend.id }}
            >
              <Avatar friend={friend} size={42} />
              <View className="flex-1">
                <Txt style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
                  {friend.id === 'solo' ? 'Hrám sám' : friend.name}
                </Txt>
                {friend.id === 'solo' && (
                  <Txt className="text-muted mt-1 text-[12px]">Len pre jedného hráča</Txt>
                )}
                {friend.demo && <Txt className="text-muted mt-1 text-[12px]">Ukážkový hráč</Txt>}
              </View>
              {opponent.id === friend.id && (
                <Check size={22} color={palette.ink} strokeWidth={1.8} />
              )}
            </PressableFeedback>
            {friend.id === 'solo' && friends.length > 0 && (
              <Accordion
                selectionMode="single"
                hideSeparator
                className="mb-2"
                value={friendsExpanded ? 'friends' : ''}
                onValueChange={(value: string | undefined) => {
                  setFriendsExpanded(value === 'friends');
                  feedback.selection();
                }}
              >
                <Accordion.Item value="friends">
                  <Accordion.Trigger className="gap-3 rounded-xl p-3">
                    <View
                      className="bg-ink items-center justify-center rounded-full"
                      style={{ width: 42, height: 42 }}
                    >
                      <Users size={20} color={palette.yellow} strokeWidth={1.8} />
                    </View>
                    <View className="flex-1">
                      <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
                        Priatelia
                      </Txt>
                      <Txt className="text-muted mt-1 text-[12px]" numberOfLines={1}>
                        {friends.find((f) => f.id === selected)?.name ??
                          `${friends.length} ${friends.length === 1 ? 'priateľ' : friends.length < 5 ? 'priatelia' : 'priateľov'}`}
                      </Txt>
                    </View>
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                  <Accordion.Content>
                    {friends.map((f) => (
                      <PressableFeedback
                        key={f.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: selected === f.id }}
                        onPress={() => {
                          if (tempName) setTempName('');
                          if (selected !== f.id) {
                            setSelected(f.id);
                            feedback.selection();
                          }
                        }}
                        className={`mx-3 mb-1 flex-row items-center gap-3 rounded-xl px-3 py-2 ${selected === f.id ? 'bg-surface' : ''}`}
                      >
                        <Avatar friend={f} size={34} />
                        <Txt
                          className="flex-1 text-[14px]"
                          numberOfLines={1}
                          style={{ fontFamily: 'Inter_600SemiBold' }}
                        >
                          {f.name}
                        </Txt>
                        <View className="w-5">
                          {selected === f.id && (
                            <Check size={20} color={palette.ink} strokeWidth={1.8} />
                          )}
                        </View>
                      </PressableFeedback>
                    ))}
                  </Accordion.Content>
                </Accordion.Item>
              </Accordion>
            )}
            {friend.id === 'solo' && (
              <Accordion
                selectionMode="single"
                hideSeparator
                className="mb-2"
                value={botExpanded ? 'bots' : ''}
                onValueChange={(value: string | undefined) => {
                  setBotExpanded(value === 'bots');
                  feedback.selection();
                }}
              >
                <Accordion.Item value="bots">
                  <Accordion.Trigger className="gap-3 rounded-xl p-3">
                    <Avatar friend={{ ...botOpponent, name: 'Bot' }} size={42} />
                    <View className="flex-1">
                      <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
                        Hrám s botom
                      </Txt>
                      {selected === 'bot' && (
                        <Txt className="text-muted mt-1 text-[12px]" numberOfLines={1}>
                          {selectedBot.name} · {selectedBot.min}–{selectedBot.max}
                        </Txt>
                      )}
                    </View>
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                  <Accordion.Content>
                    <Txt className="text-muted px-3 pb-2 text-[12px]">
                      Cieľový priemer na 3 šípky. V jednotlivom zápase môže kolísať.
                    </Txt>
                    {BOTS.map((bot) => (
                      <PressableFeedback
                        key={bot.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: selected === 'bot' && botId === bot.id }}
                        onPress={() => {
                          if (selected !== 'bot' || botId !== bot.id) feedback.selection();
                          setSelected('bot');
                          setBotId(bot.id);
                          setTempName('');
                        }}
                        className={`mx-3 mb-1 flex-row items-center gap-2 rounded-xl px-3 py-3 ${selected === 'bot' && botId === bot.id ? 'bg-surface' : ''}`}
                      >
                        <Txt
                          className="flex-1 text-[14px]"
                          numberOfLines={1}
                          style={{ fontFamily: 'Inter_600SemiBold' }}
                        >
                          {bot.name}
                        </Txt>
                        <Txt className="text-muted text-[13px]" numberOfLines={1}>
                          {bot.min}–{bot.max}
                        </Txt>
                        <View className="w-5">
                          {selected === 'bot' && botId === bot.id && (
                            <Check size={20} color={palette.ink} strokeWidth={1.8} />
                          )}
                        </View>
                      </PressableFeedback>
                    ))}
                  </Accordion.Content>
                </Accordion.Item>
              </Accordion>
            )}
          </View>
        )}
        ListFooterComponent={
          <View>
            <Heading className="mt-7 mb-4 text-[20px]">Hra</Heading>
            <View className="flex-row gap-3">
              {([301, 501] as const).map((n) => (
                <Button
                  key={n}
                  className="h-16 flex-1 rounded-xl"
                  variant={mode === 'x01' && starting === n ? 'secondary' : 'tertiary'}
                  onPress={() => {
                    if (mode !== 'x01' || starting !== n) {
                      setMode('x01');
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
              <Button
                className="h-16 flex-1 rounded-xl"
                variant={mode === 'cricket' ? 'secondary' : 'tertiary'}
                onPress={() => {
                  if (mode !== 'cricket') {
                    setMode('cricket');
                    feedback.selection();
                  }
                }}
              >
                <Button.Label
                  className="text-[20px]"
                  numberOfLines={1}
                  style={{ fontFamily: 'Inter_700Bold' }}
                >
                  Cricket
                </Button.Label>
              </Button>
            </View>
            {mode === 'cricket' ? (
              <CricketStart
                opponent={opponent}
                twoPlayers={selected !== 'solo' && selected !== 'bot'}
                running={!!cricketGame}
                onStart={() => {
                  setCricket(newCricket(['Ty', opponent.name], opponent.id));
                  feedback.success();
                  router.replace('/games/cricket');
                }}
              />
            ) : (
              <>
                <Heading className="mt-7 mb-4 text-[20px]">Na koľko víťazných legov?</Heading>
                <LegPicker value={legsToWin} onChange={setLegsToWin} />
                <Heading className="mt-7 mb-4 text-[20px]">Ukončenie hry</Heading>
                <View className="flex-row gap-3">
                  {[true, false].map((d) => (
                    <Button
                      key={String(d)}
                      className="flex-1 rounded-xl"
                      variant={doubleOut === d ? 'secondary' : 'tertiary'}
                      onPress={() => {
                        if (doubleOut !== d) {
                          setDoubleOut(d);
                          feedback.selection();
                        }
                      }}
                    >
                      <Button.Label numberOfLines={1}>
                        {d ? 'Double out' : 'Straight out'}
                      </Button.Label>
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
                        startGame(
                          opponent,
                          starting,
                          doubleOut,
                          legsToWin,
                          opponent.id === 'solo',
                          selected === 'bot'
                            ? {
                                id: selectedBot.id,
                                target:
                                  selectedBot.min +
                                  Math.random() * (selectedBot.max - selectedBot.min),
                              }
                            : undefined,
                        );
                        feedback.success();
                        router.replace('/match');
                      }}
                    >
                      <Target size={20} color={palette.ink} strokeWidth={1.8} />
                      <Button.Label>Začať zápas</Button.Label>
                    </Button>
                  </View>
                )}
              </>
            )}
            <Button className="mt-5" variant="ghost" onPress={() => router.dismissTo('/')}>
              <Button.Label>Späť domov</Button.Label>
            </Button>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

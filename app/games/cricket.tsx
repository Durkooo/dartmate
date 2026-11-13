import { useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button, Input } from 'heroui-native';
import { Trophy, Undo2 } from 'lucide-react-native';
import { Page, Heading, Txt, LoadingRows } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';
import { usePlayers } from '@/lib/players';
import {
  CRICKET_TARGETS,
  cricketDart,
  cricketEndTurn,
  cricketUndo,
  newCricket,
  useExtraGames,
} from '@/lib/games';

const markSymbol = (m: number) => (m >= 3 ? 'Ⓧ' : m === 2 ? '✕' : m === 1 ? '/' : '');

export default function Cricket() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.cricket);
  const setGame = useExtraGames((s) => s.setCricket);
  const finish = useExtraGames((s) => s.finish);
  const myNick = usePlayers((s) => s.profile?.nickname);
  const [opponent, setOpponent] = useState('');
  const [mult, setMult] = useState<1 | 2 | 3>(1);
  if (!hydrated)
    return (
      <Page>
        <LoadingRows />
      </Page>
    );
  if (!game)
    return (
      <Page>
        <Stack.Screen options={{ title: 'Cricket' }} />
        <View className="mt-3 gap-4">
          <Heading>Cricket</Heading>
          <Txt className="text-muted text-[14px] leading-6">
            Každý hráč zatvára čísla 20 až 15 a bull trojicou zásahov (double = 2, triple = 3).
            Zásahy navyše do zavretého čísla dávajú body, kým ho nezavrie aj súper. Vyhrá, kto
            zavrie všetko a má aspoň toľko bodov ako súper.
          </Txt>
          <Input
            value={opponent}
            onChangeText={setOpponent}
            placeholder="Meno súpera"
            accessibilityLabel="Meno súpera"
            maxLength={24}
          />
          <Button
            size="lg"
            onPress={() => {
              setGame(newCricket([myNick ? `@${myNick}` : 'Ja', opponent.trim() || 'Súper']));
              feedback.success();
            }}
          >
            <Button.Label>Začať Cricket</Button.Label>
          </Button>
        </View>
      </Page>
    );
  const p = game.turn;
  const dart = (target: number | null) => {
    const next = cricketDart(game, target, target === 6 && mult === 3 ? 2 : mult);
    setGame(next);
    setMult(1);
    if (next.winner !== null) feedback.success();
    else feedback.selection();
  };
  return (
    <Page hideFallback>
      <Stack.Screen options={{ title: 'Cricket' }} />
      <View className="mt-2 gap-3">
        {/* Hlavička: mená a body, aktívny hráč zvýraznený */}
        <View className="flex-row gap-2">
          {game.players.map((name, i) => (
            <View
              key={name + String(i)}
              className="flex-1 rounded-xl p-3"
              style={{
                backgroundColor: game.winner === null && p === i ? palette.ink : palette.white,
              }}
            >
              <Txt
                numberOfLines={1}
                style={{
                  fontFamily: 'Inter_600SemiBold',
                  color: game.winner === null && p === i ? palette.white : palette.ink,
                }}
              >
                {name}
              </Txt>
              <Txt
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 32,
                  fontVariant: ['tabular-nums'],
                  color: game.winner === null && p === i ? palette.yellow : palette.ink,
                }}
              >
                {game.points[i]}
              </Txt>
            </View>
          ))}
        </View>
        {/* Tabuľka zásahov */}
        <View className="bg-surface rounded-xl px-3 py-1">
          {CRICKET_TARGETS.map((value, t) => (
            <View key={value} className="flex-row items-center" style={{ height: 26 }}>
              <Txt className="flex-1 text-center text-[18px]">{markSymbol(game.marks[0][t])}</Txt>
              <Txt
                className="w-16 text-center"
                style={{
                  fontFamily: 'Inter_700Bold',
                  color:
                    game.marks[0][t] >= 3 && game.marks[1][t] >= 3 ? palette.muted : palette.ink,
                }}
              >
                {value === 25 ? 'Bull' : value}
              </Txt>
              <Txt className="flex-1 text-center text-[18px]">{markSymbol(game.marks[1][t])}</Txt>
            </View>
          ))}
        </View>
        {game.winner !== null ? (
          <View className="items-center gap-3 py-4">
            <Trophy size={32} color={palette.ink} strokeWidth={1.8} />
            <Heading>Vyhral {game.players[game.winner]}</Heading>
            <Txt className="text-muted">
              Šípky: {game.totalDarts[0]} : {game.totalDarts[1]}
            </Txt>
            <Button
              size="lg"
              className="w-full"
              onPress={() => {
                finish('cricket');
                router.dismissTo('/games');
              }}
            >
              <Button.Label>Uložiť a skončiť</Button.Label>
            </Button>
            <Button variant="ghost" onPress={() => setGame(cricketUndo(game))}>
              <Undo2 size={18} color={palette.ink} />
              <Button.Label>Vrátiť poslednú šípku</Button.Label>
            </Button>
          </View>
        ) : (
          <>
            <Txt className="text-muted text-center text-[13px]">
              Hádže {game.players[p]} · šípka {game.dartsInTurn + 1} z 3
            </Txt>
            <View className="flex-row gap-2">
              {([1, 2, 3] as const).map((m) => (
                <Button
                  key={m}
                  className="flex-1"
                  variant={mult === m ? 'primary' : 'secondary'}
                  onPress={() => setMult(m)}
                >
                  <Button.Label>{m === 1 ? 'Single' : m === 2 ? 'Double' : 'Triple'}</Button.Label>
                </Button>
              ))}
            </View>
            <View className="flex-row flex-wrap gap-2">
              {CRICKET_TARGETS.map((value, t) => (
                <Button
                  key={value}
                  size="lg"
                  variant="secondary"
                  style={{ width: '22.5%' }}
                  isDisabled={value === 25 && mult === 3}
                  onPress={() => dart(t)}
                >
                  <Button.Label>{value === 25 ? 'Bull' : String(value)}</Button.Label>
                </Button>
              ))}
              <Button
                size="lg"
                variant="outline"
                style={{ width: '22.5%' }}
                onPress={() => dart(null)}
              >
                <Button.Label>Mimo</Button.Label>
              </Button>
            </View>
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                variant="ghost"
                isDisabled={!game.past.length}
                onPress={() => setGame(cricketUndo(game))}
              >
                <Undo2 size={18} color={palette.ink} />
                <Button.Label>Späť</Button.Label>
              </Button>
              <Button
                className="flex-1"
                variant="ghost"
                isDisabled={game.dartsInTurn === 0}
                onPress={() => setGame(cricketEndTurn(game))}
              >
                <Button.Label>Ukončiť kolo</Button.Label>
              </Button>
            </View>
            <Button variant="ghost" onPress={() => setGame(null)}>
              <Button.Label>Zrušiť hru</Button.Label>
            </Button>
          </>
        )}
      </View>
    </Page>
  );
}

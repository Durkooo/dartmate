import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button } from 'heroui-native';
import { RotateCcw, Trophy, Undo2 } from 'lucide-react-native';
import { Heading, Txt, LoadingRows, Empty } from '@/components/DartsUI';
import { PadButton, ScoreBoard } from '@/components/GameBoard';
import { feedback, palette } from '@/lib/darts';
import { ShareResult } from '@/components/ShareResult';
import { formatCricketResult } from '@/lib/matchResult';
import { renderResultImage } from '@/lib/resultImage';
import { usePlayers } from '@/lib/players';
import {
  CRICKET_TARGETS,
  cricketDart,
  cricketEndTurn,
  cricketUndo,
  newCricket,
  useExtraGames,
} from '@/lib/games';

const markSymbol = (m: number) => (m >= 3 ? 'Ⓧ' : m === 2 ? '✕' : m === 1 ? '/' : '–');
const label = (value: number) => (value === 25 ? 'Bull' : String(value));

export default function Cricket() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.cricket);
  const setGame = useExtraGames((s) => s.setCricket);
  const finish = useExtraGames((s) => s.finish);
  const [mult, setMult] = useState<1 | 2 | 3>(1);
  const friends = usePlayers((s) => s.friends);
  const myNick = usePlayers((s) => s.profile?.nickname);
  if (!hydrated)
    return (
      <View className="bg-background flex-1 p-5">
        <LoadingRows />
      </View>
    );
  if (!game)
    return (
      <View className="bg-background flex-1 p-5">
        <Stack.Screen options={{ title: 'Cricket' }} />
        <Empty
          text="Nemáš rozohraný Cricket."
          action="Nová hra"
          onPress={() => router.replace('/new-match')}
        />
      </View>
    );
  const p = game.turn;
  const finished = game.winner !== null;
  const round = Math.floor((game.totalDarts[0] + game.totalDarts[1]) / 6) + 1;
  const dart = (target: number | null) => {
    const next = cricketDart(game, target, target === 6 && mult === 3 ? 2 : mult);
    setGame(next);
    setMult(1);
    if (next.winner !== null) feedback.success();
    else feedback.selection();
  };
  return (
    <View className="bg-background flex-1">
      <Stack.Screen options={{ title: 'Cricket' }} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 32,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <ScoreBoard
          top={finished ? 'Hra dohraná' : `Kolo ${round}`}
          players={game.players.map((name, i) => ({
            name,
            value: String(game.points[i]),
            sub: `Šípky ${game.totalDarts[i]}`,
          }))}
          active={finished ? null : p}
          bottom={
            finished
              ? game.winner === 0
                ? 'Vyhral si!'
                : `${game.players[game.winner ?? 1]} vyhráva!`
              : `Na ťahu: ${game.players[p]} · šípka ${game.dartsInTurn + 1} z 3`
          }
        />
        <View className="mb-4 flex-row items-center justify-between">
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Cricket · 20–15 a bull</Txt>
        </View>
        {/* Zásahy: hráč 1 | číslo | hráč 2 */}
        <View className="bg-surface mb-4 rounded-xl px-3 py-2">
          {CRICKET_TARGETS.map((value, t) => {
            const dead = game.marks[0][t] >= 3 && game.marks[1][t] >= 3;
            return (
              <View key={value} className="flex-row items-center" style={{ height: 28 }}>
                <Txt
                  className="flex-1 text-center text-[18px]"
                  style={{ color: game.marks[0][t] ? palette.ink : palette.line }}
                >
                  {markSymbol(game.marks[0][t])}
                </Txt>
                <Txt
                  className="w-16 text-center text-[16px]"
                  style={{
                    fontFamily: 'Inter_700Bold',
                    color: dead ? palette.muted : palette.ink,
                    textDecorationLine: dead ? 'line-through' : 'none',
                  }}
                >
                  {label(value)}
                </Txt>
                <Txt
                  className="flex-1 text-center text-[18px]"
                  style={{ color: game.marks[1][t] ? palette.ink : palette.line }}
                >
                  {markSymbol(game.marks[1][t])}
                </Txt>
              </View>
            );
          })}
        </View>
        {finished ? (
          <View className="items-center gap-4 py-6">
            <Trophy size={36} color={palette.ink} strokeWidth={1.8} />
            <Heading>{game.winner === 0 ? 'Dobrý zásah.' : 'Čas na odvetu.'}</Heading>
            {!!myNick &&
              (() => {
                const friend = friends.find((f) => !f.demo && f.id === game.opponentId);
                return (
                  <ShareResult
                    peerId={friend?.id}
                    peerName={friend?.handle}
                    body={formatCricketResult({
                      me: myNick,
                      opponent: game.players[1],
                      opponentTagged: !!friend,
                      points: game.points,
                      darts: game.totalDarts,
                      won: game.winner === 0,
                    })}
                    image={() =>
                      renderResultImage({
                        subtitle: 'Cricket',
                        players: [
                          { name: `@${myNick}`, score: String(game.points[0]) },
                          {
                            name: friend ? `@${friend.handle}` : game.players[1],
                            score: String(game.points[1]),
                          },
                        ],
                        winner: game.winner,
                        rows: [
                          {
                            label: 'Body',
                            values: game.points.map(String),
                          },
                          {
                            label: 'Zavreté čísla (z 7)',
                            values: game.marks.map((m) => String(m.filter((x) => x >= 3).length)),
                          },
                          { label: 'Šípky', values: game.totalDarts.map(String) },
                        ],
                      })
                    }
                  />
                );
              })()}
            <Button
              size="lg"
              className="w-full"
              onPress={() => {
                const players = game.players;
                const opponentId = game.opponentId;
                finish('cricket');
                setGame(newCricket(players, opponentId));
                feedback.success();
              }}
            >
              <RotateCcw size={20} color={palette.navy} strokeWidth={1.8} />
              <Button.Label>Odveta</Button.Label>
            </Button>
            <Button
              size="lg"
              variant="tertiary"
              className="w-full"
              onPress={() => {
                finish('cricket');
                feedback.success();
                router.dismissTo('/');
              }}
            >
              <Button.Label>Uložiť výsledok</Button.Label>
            </Button>
            <Button variant="ghost" onPress={() => setGame(cricketUndo(game))}>
              <Undo2 size={18} color={palette.ink} />
              <Button.Label>Opraviť poslednú šípku</Button.Label>
            </Button>
          </View>
        ) : (
          <View className="gap-2">
            <View className="flex-row gap-2">
              {([1, 2, 3] as const).map((m) => (
                <PadButton
                  key={m}
                  label={m === 1 ? 'Single' : m === 2 ? 'Double' : 'Triple'}
                  selected={mult === m}
                  toggle
                  onPress={() => {
                    setMult(m);
                    feedback.selection();
                  }}
                />
              ))}
            </View>
            <View className="flex-row gap-2">
              {[0, 1, 2, 3].map((t) => (
                <PadButton key={t} label={label(CRICKET_TARGETS[t])} onPress={() => dart(t)} />
              ))}
            </View>
            <View className="flex-row gap-2">
              {[4, 5, 6].map((t) => (
                <PadButton
                  key={t}
                  label={label(CRICKET_TARGETS[t])}
                  disabled={t === 6 && mult === 3}
                  onPress={() => dart(t)}
                />
              ))}
              <PadButton label="Mimo" onPress={() => dart(null)} />
            </View>
            <View className="flex-row gap-2">
              <PadButton
                accessibilityLabel="Vrátiť poslednú šípku"
                disabled={!game.past.length}
                onPress={() => {
                  setGame(cricketUndo(game));
                  feedback.selection();
                }}
              >
                <Undo2 size={21} color={palette.yellow} strokeWidth={1.8} />
              </PadButton>
              <PadButton
                label="Ďalší hráč"
                disabled={game.dartsInTurn === 0}
                onPress={() => setGame(cricketEndTurn(game))}
              />
            </View>
            <Button
              className="mt-4"
              variant="ghost"
              onPress={() => {
                setGame(null);
                router.dismissTo('/');
              }}
            >
              <Button.Label>Zrušiť hru</Button.Label>
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

import { View } from 'react-native';
import { Button } from 'heroui-native';
import { TrainingScreen } from '@/components/TrainingUI';
import { Txt } from '@/components/DartsUI';
import { feedback } from '@/lib/darts';
import {
  BOBS_ROUNDS,
  bobsDouble,
  bobsLabel,
  bobsRound,
  bobsUndo,
  newBobs,
  useExtraGames,
} from '@/lib/games';

export default function Bobs27() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.bobs);
  const setGame = useExtraGames((s) => s.setBobs);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.bobsBest);
  const finished = !!game?.over;
  return (
    <TrainingScreen
      title="Bob's 27"
      hydrated={hydrated}
      running={!!game}
      intro={`Začínaš s 27 bodmi. V každom kole hodíš 3 šípky na jeden double: D1, D2 … D20 a nakoniec D-bull. Každý zásah pripočíta hodnotu doublu, keď netrafíš ani raz, hodnota sa odpočíta. Pod nulou hra končí.${best !== null ? ` Tvoj rekord: ${best} bodov.` : ''}`}
      onStart={() => setGame(newBobs())}
      big={game ? String(game.score) : ''}
      caption={
        game
          ? finished
            ? `Zásahy: ${game.hits}`
            : `Kolo ${game.round + 1}/${BOBS_ROUNDS} · hádžeš na ${bobsLabel(game.round)} (${bobsDouble(game.round)})`
          : ''
      }
      done={finished}
      result={
        game
          ? game.score < 0
            ? `Koniec v kole ${bobsLabel(game.round - 1)}`
            : `Výsledok ${game.score} bodov`
          : ''
      }
      onFinish={() => finish('bobs')}
      onUndo={() => game && setGame(bobsUndo(game))}
      canUndo={!!game?.past.length}
      onCancel={() => setGame(null)}
    >
      <Txt className="text-muted text-center text-[13px]">Koľkokrát si trafil double?</Txt>
      <View className="flex-row gap-2">
        {([0, 1, 2, 3] as const).map((hits) => (
          <Button
            key={hits}
            size="lg"
            className="flex-1"
            variant={hits ? 'primary' : 'secondary'}
            onPress={() => {
              if (!game) return;
              setGame(bobsRound(game, hits));
              feedback.selection();
            }}
          >
            <Button.Label>{String(hits)}</Button.Label>
          </Button>
        ))}
      </View>
    </TrainingScreen>
  );
}

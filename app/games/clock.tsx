import { View } from 'react-native';
import { Button } from 'heroui-native';
import { TrainingScreen } from '@/components/TrainingUI';
import { feedback } from '@/lib/darts';
import { clockDart, clockLabel, clockUndo, newClock, useExtraGames } from '@/lib/games';

export default function AroundTheClock() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.clock);
  const setGame = useExtraGames((s) => s.setClock);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.clockBest);
  return (
    <TrainingScreen
      title="Around the Clock"
      hydrated={hydrated}
      running={!!game}
      intro={`Traf postupne 1, 2, 3 … 20 a nakoniec bull. Ráta sa každý segment čísla (single, double aj triple). Po každej šípke ťukni Zásah alebo Vedľa. Cieľ: čo najmenej šípok.${best !== null ? ` Tvoj rekord: ${best} šípok.` : ''}`}
      onStart={() => setGame(newClock())}
      big={game ? (game.done ? '✓' : clockLabel(game.target)) : ''}
      caption={game ? `Šípky: ${game.darts}` : ''}
      done={!!game?.done}
      result={game ? `Hotovo za ${game.darts} šípok` : ''}
      onFinish={() => finish('clock')}
      onUndo={() => game && setGame(clockUndo(game))}
      canUndo={!!game?.past.length}
      onCancel={() => setGame(null)}
    >
      <View className="flex-row gap-2">
        <Button
          size="lg"
          className="flex-1"
          onPress={() => {
            if (!game) return;
            setGame(clockDart(game, true));
            feedback.selection();
          }}
        >
          <Button.Label>Zásah</Button.Label>
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="flex-1"
          onPress={() => game && setGame(clockDart(game, false))}
        >
          <Button.Label>Vedľa</Button.Label>
        </Button>
      </View>
    </TrainingScreen>
  );
}

import { TRAINING_ICONS } from '@/lib/trainingIcons';
import { View } from 'react-native';
import { TrainingScreen } from '@/components/TrainingUI';
import { PadButton } from '@/components/GameBoard';
import { feedback } from '@/lib/darts';
import { clockDart, clockLabel, clockUndo, newClock, useExtraGames } from '@/lib/games';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '–');

export default function AroundTheClock() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.clock);
  const setGame = useExtraGames((s) => s.setClock);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.clockBest);
  return (
    <TrainingScreen
      icon={TRAINING_ICONS.clock}
      title="Around the Clock"
      hydrated={hydrated}
      running={!!game}
      intro={`Traf postupne 1, 2, 3 … 20 a nakoniec bull. Ráta sa každý segment čísla (single, double aj triple). Po každej šípke ťukni Zásah alebo Vedľa. Cieľ: čo najmenej šípok.${best !== null ? ` Tvoj rekord: ${best} šípok.` : ''}`}
      onStart={() => setGame(newClock())}
      top={game ? `Šípky ${game.darts}` : ''}
      big={game ? (game.done ? '✓' : clockLabel(game.target)) : ''}
      sub={game && !game.done ? `${Math.min(game.target, 21) - 1} z 21 hotových` : undefined}
      bottom={game ? (game.done ? 'Hotovo!' : `Hádžeš na: ${clockLabel(game.target)}`) : ''}
      done={!!game?.done}
      result={game ? `Hotovo za ${game.darts} šípok` : ''}
      onFinish={() => finish('clock')}
      shareScore={game ? `${game.darts} šípok` : ''}
      stats={
        game
          ? [
              { label: 'Šípky spolu', value: String(game.darts) },
              { label: 'Trafené čísla', value: `${Math.min(game.target, 22) - 1} z 21` },
              { label: 'Úspešnosť zásahov', value: pct(Math.min(game.target, 22) - 1, game.darts) },
              {
                label: 'Šípky na jedno číslo',
                value: (game.darts / Math.max(1, Math.min(game.target, 22) - 1)).toFixed(1),
              },
            ]
          : []
      }
      onUndo={() => game && setGame(clockUndo(game))}
      canUndo={!!game?.past.length}
      onCancel={() => setGame(null)}
    >
      <View className="flex-row gap-2">
        <PadButton
          label="Zásah"
          selected
          onPress={() => {
            if (!game) return;
            setGame(clockDart(game, true));
            feedback.selection();
          }}
        />
        <PadButton
          label="Vedľa"
          onPress={() => {
            if (!game) return;
            setGame(clockDart(game, false));
            feedback.selection();
          }}
        />
      </View>
    </TrainingScreen>
  );
}

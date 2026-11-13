import { View } from 'react-native';
import { Button } from 'heroui-native';
import { TrainingScreen } from '@/components/TrainingUI';
import { Txt } from '@/components/DartsUI';
import { feedback } from '@/lib/darts';
import { C121_ATTEMPTS, c121Attempt, c121Undo, newC121, useExtraGames } from '@/lib/games';

export default function Checkout121() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.c121);
  const setGame = useExtraGames((s) => s.setC121);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.c121Best);
  return (
    <TrainingScreen
      title="121"
      hydrated={hydrated}
      running={!!game}
      intro={`Na každý pokus máš 9 šípok (3 kolá), aby si zatvoril číslo na double. Začína sa na 121. Keď zatvoríš, ďalší cieľ je o 1 vyšší, inak ostáva rovnaký. Hrá sa ${C121_ATTEMPTS} pokusov.${best !== null ? ` Tvoj rekord: zatvorené ${best}.` : ''}`}
      onStart={() => setGame(newC121())}
      big={game ? String(game.target) : ''}
      caption={
        game
          ? game.done
            ? `Zatvorené ${game.successes} z ${C121_ATTEMPTS}`
            : `Pokus ${game.attempt + 1}/${C121_ATTEMPTS} · zatvorené ${game.successes}`
          : ''
      }
      done={!!game?.done}
      result={
        game ? (game.best ? `Najvyššie zatvorené ${game.best}` : 'Tentoraz bez zatvorenia') : ''
      }
      onFinish={() => finish('c121')}
      onUndo={() => game && setGame(c121Undo(game))}
      canUndo={!!game?.past.length}
      onCancel={() => setGame(null)}
    >
      <Txt className="text-muted text-center text-[13px]">Zatvoril si do 9 šípok?</Txt>
      <View className="flex-row gap-2">
        <Button
          size="lg"
          className="flex-1"
          onPress={() => {
            if (!game) return;
            setGame(c121Attempt(game, true));
            feedback.success();
          }}
        >
          <Button.Label>Zatvoril</Button.Label>
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="flex-1"
          onPress={() => game && setGame(c121Attempt(game, false))}
        >
          <Button.Label>Nezatvoril</Button.Label>
        </Button>
      </View>
    </TrainingScreen>
  );
}

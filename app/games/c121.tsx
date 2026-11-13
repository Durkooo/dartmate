import { View } from 'react-native';
import { TrainingScreen } from '@/components/TrainingUI';
import { PadButton } from '@/components/GameBoard';
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
      top={game ? `Pokus ${Math.min(game.attempt + 1, C121_ATTEMPTS)} z ${C121_ATTEMPTS}` : ''}
      big={game ? String(game.target) : ''}
      sub={game ? `Zatvorené ${game.successes}` : undefined}
      bottom={game ? (game.done ? 'Koniec tréningu' : `Zatvor ${game.target} do 9 šípok`) : ''}
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
        <PadButton
          label="Zatvoril"
          selected
          onPress={() => {
            if (!game) return;
            setGame(c121Attempt(game, true));
            feedback.success();
          }}
        />
        <PadButton
          label="Nezatvoril"
          onPress={() => {
            if (!game) return;
            setGame(c121Attempt(game, false));
            feedback.selection();
          }}
        />
      </View>
    </TrainingScreen>
  );
}

import { View } from 'react-native';
import { Txt } from '@/components/DartsUI';
import { PadButton } from '@/components/GameBoard';
import { TrainingScreen } from '@/components/TrainingUI';
import { feedback } from '@/lib/darts';
import {
  FINISH_ROUNDS,
  finishHint,
  finishRound,
  finishTotal,
  finishUndo,
  newFinish,
  useExtraGames,
} from '@/lib/games';

export default function Finishing50() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.finishing);
  const setGame = useExtraGames((s) => s.setFinishing);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.finishBest ?? null);
  const round = game ? game.results.length : 0;
  const target = game && !game.done ? game.targets[round] : null;
  const total = game ? finishTotal(game) : 0;
  const closed = game ? game.results.filter((r) => r > 0).length : 0;
  return (
    <TrainingScreen
      title="Finishing 50"
      hydrated={hydrated}
      running={!!game}
      intro={`${FINISH_ROUNDS} kôl, v každom dostaneš náhodné číslo od 2 do 50 a máš 3 šípky, aby si ho zatvoril na double (50 = bull). Body: zatvorené 1 šípkou = 3, 2 šípkami = 2, 3 šípkami = 1, nezatvorené = 0. Maximum je ${FINISH_ROUNDS * 3}.${best !== null ? ` Tvoj rekord: ${best} bodov.` : ''}`}
      onStart={() => setGame(newFinish())}
      top={
        game ? `Kolo ${Math.min(round + 1, FINISH_ROUNDS)} z ${FINISH_ROUNDS} · body ${total}` : ''
      }
      big={target !== null ? String(target) : String(total)}
      sub={
        target !== null ? `Cesta: ${finishHint(target)}` : `Zatvorené ${closed} z ${FINISH_ROUNDS}`
      }
      bottom={target !== null ? `Zatvor ${target} na 3 šípky` : 'Koniec tréningu'}
      done={!!game?.done}
      result={`${total} bodov · zatvorené ${closed} z ${FINISH_ROUNDS}`}
      onFinish={() => finish('finishing')}
      onUndo={() => game && setGame(finishUndo(game))}
      canUndo={!!game?.results.length}
      onCancel={() => setGame(null)}
    >
      <Txt className="text-muted text-center text-[13px]">
        Koľkou šípkou si zatvoril? (1., 2. alebo 3.)
      </Txt>
      <View className="flex-row gap-2">
        {(
          [
            [3, '1.'],
            [2, '2.'],
            [1, '3.'],
          ] as const
        ).map(([points, label]) => (
          <PadButton
            key={points}
            label={label}
            accessibilityLabel={`Zatvorené ${label} šípkou`}
            selected
            onPress={() => {
              if (!game) return;
              setGame(finishRound(game, points));
              feedback.success();
            }}
          />
        ))}
      </View>
      <View className="flex-row gap-2">
        <PadButton
          label="Nezatvoril"
          onPress={() => {
            if (!game) return;
            setGame(finishRound(game, 0));
            feedback.selection();
          }}
        />
      </View>
    </TrainingScreen>
  );
}

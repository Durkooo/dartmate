import { TRAINING_ICONS } from '@/lib/trainingIcons';
import { View } from 'react-native';
import { Txt } from '@/components/DartsUI';
import { PadButton } from '@/components/GameBoard';
import { OptionPicker, TrainingScreen } from '@/components/TrainingUI';
import { feedback, validCheckout } from '@/lib/darts';
import { useState } from 'react';
import {
  FINISH_ROUNDS,
  ROUND_OPTIONS,
  endTraining,
  finishRounds,
  finishTarget,
  roundOf,
  roundsLabel,
  type RoundsCount,
  finishHint,
  finishRound,
  finishTotal,
  finishUndo,
  newFinish,
  useExtraGames,
} from '@/lib/games';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '–');

export default function Finishing50() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.finishing);
  const setGame = useExtraGames((s) => s.setFinishing);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.finishBest ?? null);
  const [rounds, setRounds] = useState<RoundsCount>(FINISH_ROUNDS);
  const gameRounds = game ? finishRounds(game) : rounds;
  const round = game ? game.results.length : 0;
  const target = game && !game.done ? finishTarget(game) : null;
  const played = Math.max(round, 0);
  const total = game ? finishTotal(game) : 0;
  const closed = game ? game.results.filter((r) => r > 0).length : 0;
  return (
    <TrainingScreen
      icon={TRAINING_ICONS.finishing}
      mode="finishing"
      scoreValue={game ? total : null}
      unit="bodov"
      title="Finishing 50"
      hydrated={hydrated}
      running={!!game}
      intro={`Vybraný počet kôl (∞ = hráš, kým tréning neukončíš), v každom dostaneš náhodné číslo od 2 do 50 a máš 3 šípky, aby si ho zatvoril na double (50 = bull). Body: zatvorené 1 šípkou = 3, 2 šípkami = 2, 3 šípkami = 1, nezatvorené = 0. Maximum sú 3 body za kolo.${best !== null ? ` Tvoj rekord: ${best} bodov.` : ''}`}
      introExtra={
        <OptionPicker
          label="Počet kôl"
          options={ROUND_OPTIONS}
          value={rounds}
          format={roundsLabel}
          onChange={(v) => {
            setRounds(v);
            feedback.selection();
          }}
        />
      }
      onStart={() => setGame(newFinish(rounds))}
      top={game ? `${roundOf(round + 1, gameRounds)} · body ${total}` : ''}
      onEnd={
        game && gameRounds === null && round > 0 ? () => setGame(endTraining(game)) : undefined
      }
      big={target !== null ? String(target) : String(total)}
      sub={target !== null ? `Cesta: ${finishHint(target)}` : `Zatvorené ${closed} z ${played}`}
      bottom={target !== null ? `Zatvor ${target} na 3 šípky` : 'Koniec tréningu'}
      done={!!game?.done}
      result={`${total} bodov · zatvorené ${closed} z ${played}`}
      onFinish={() => finish('finishing')}
      shareScore={`${total} b.`}
      stats={
        game
          ? [
              { label: 'Odohrané kolá', value: String(played) },
              { label: 'Body', value: `${total} z ${played * 3}` },
              { label: 'Zatvorené', value: `${closed} z ${played}` },
              { label: 'Úspešnosť zatvorenia', value: pct(closed, played) },
              {
                label: 'Zatvorené 1. šípkou',
                value: String(game.results.filter((r) => r === 3).length),
              },
              {
                label: 'Priemer šípok na zatvorenie',
                value: closed
                  ? (
                      game.results.filter((r) => r > 0).reduce((a, r) => a + (4 - r), 0) / closed
                    ).toFixed(1)
                  : '–',
              },
            ]
          : []
      }
      onUndo={() => game && setGame(finishUndo(game))}
      canUndo={!!game?.results.length}
      onCancel={() => setGame(null)}
    >
      <Txt className="text-muted text-center text-[13px]">
        Koľkou šípkou si zatvoril? (nemožné počty sú vypnuté)
      </Txt>
      <View className="flex-row gap-2">
        {(
          [
            [3, '1.', 1],
            [2, '2.', 2],
            [1, '3.', 3],
          ] as const
        ).map(([points, label, dartsUsed]) => (
          <PadButton
            key={points}
            label={label}
            accessibilityLabel={`Zatvorené ${label} šípkou`}
            selected
            // Len taký počet šípok, ktorým sa číslo naozaj dá zavrieť na double
            // (napr. 17 nejde 1. šípkou, 50 = bull ide).
            disabled={target === null || !validCheckout(target, dartsUsed, true)}
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

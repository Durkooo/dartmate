import { useState } from 'react';
import { Txt } from '@/components/DartsUI';
import { NumberPad } from '@/components/NumberPad';
import { TrainingScreen } from '@/components/TrainingUI';
import { feedback } from '@/lib/darts';
import {
  HIGHSCORE_ROUNDS,
  highscoreRound,
  highscoreTotal,
  highscoreUndo,
  newHighscore,
  useExtraGames,
} from '@/lib/games';

export default function Highscore() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.highscore);
  const setGame = useExtraGames((s) => s.setHighscore);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.highscoreBest ?? null);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const total = game ? highscoreTotal(game) : 0;
  const round = game ? game.scores.length : 0;
  const avg = round ? (total / round).toFixed(1) : '–';
  return (
    <TrainingScreen
      title="Highscore"
      hydrated={hydrated}
      running={!!game}
      intro={`${HIGHSCORE_ROUNDS} kôl po 3 šípky. Po každom kole zapíš, koľko si hodil (0–180). Cieľ: čo najvyšší súčet — tréning na stabilné skórovanie.${best !== null ? ` Tvoj rekord: ${best} bodov.` : ''}`}
      onStart={() => {
        setGame(newHighscore());
        setInput('');
      }}
      top={game ? `Kolo ${Math.min(round + 1, HIGHSCORE_ROUNDS)} z ${HIGHSCORE_ROUNDS}` : ''}
      big={String(total)}
      sub={`Priemer na 3 šípky ${avg}`}
      bottom={
        game
          ? game.done
            ? 'Koniec tréningu'
            : round
              ? `Posledné kolo: ${game.scores.at(-1) ?? 0}`
              : 'Zapíš skóre prvého kola'
          : ''
      }
      done={!!game?.done}
      result={`Spolu ${total} bodov`}
      onFinish={() => finish('highscore')}
      stats={
        game
          ? [
              { label: 'Súčet', value: String(total) },
              { label: 'Priemer na 3 šípky', value: avg },
              { label: 'Najvyššie kolo', value: String(Math.max(0, ...game.scores)) },
              { label: '100+', value: String(game.scores.filter((x) => x >= 100).length) },
              { label: '140+', value: String(game.scores.filter((x) => x >= 140).length) },
              { label: '180', value: String(game.scores.filter((x) => x === 180).length) },
            ]
          : []
      }
      onUndo={() => game && setGame(highscoreUndo(game))}
      canUndo={!!game?.scores.length}
      hideUndo
      onCancel={() => setGame(null)}
    >
      <NumberPad
        value={input}
        onChange={(v) => {
          setInput(v);
          setError('');
        }}
        onUndoTurn={game?.scores.length ? () => setGame(highscoreUndo(game)) : undefined}
        onSubmit={() => {
          const n = Number(input);
          if (
            !game ||
            !Number.isInteger(n) ||
            n < 0 ||
            n > 180 ||
            [163, 166, 169, 172, 173, 175, 176, 178, 179].includes(n)
          ) {
            setError('Toto skóre sa tromi šípkami hodiť nedá.');
            feedback.error();
            return;
          }
          setGame(highscoreRound(game, n));
          setInput('');
          feedback.selection();
        }}
      />
      {!!error && (
        <Txt className="text-danger text-[13px]" accessibilityRole="alert">
          {error}
        </Txt>
      )}
    </TrainingScreen>
  );
}

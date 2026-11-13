import { View } from 'react-native';
import { Txt } from '@/components/DartsUI';
import { PadButton } from '@/components/GameBoard';
import { TrainingScreen } from '@/components/TrainingUI';
import { feedback } from '@/lib/darts';
import {
  bullDart,
  bullDarts,
  bullScore,
  bullUndo,
  newBull,
  useExtraGames,
  type BullDart,
} from '@/lib/games';
import { TRAINING_ICONS } from '@/lib/trainingIcons';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '–');

export default function BullChallenge() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.bull);
  const setGame = useExtraGames((s) => s.setBull);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.bullBest ?? null);
  const darts = game ? bullDarts(game) : [];
  const score = game ? bullScore(game) : 0;
  const current = game ? game.rounds[game.rounds.length - 1] : [];
  const roundNo = game ? game.rounds.length : 0;
  const bulls = darts.filter((d) => d === 50).length;
  const outer = darts.filter((d) => d === 25).length;
  const roundScores = game
    ? game.rounds.filter((r) => r.length).map((r) => r.reduce<number>((a, b) => a + b, 0))
    : [];
  // Kolá so zásahom (posledné kolo pri konci hry je to bez zásahu).
  const survived = game
    ? game.done
      ? game.rounds.length - 1
      : game.rounds.length - (current.length ? 0 : 1)
    : 0;
  const throwDart = (d: BullDart) => {
    if (!game) return;
    const next = bullDart(game, d);
    setGame(next);
    if (next.done) feedback.error();
    else if (d) feedback.success();
    else feedback.selection();
  };
  return (
    <TrainingScreen
      icon={TRAINING_ICONS.bull}
      mode="bull"
      scoreValue={game?.done ? score : null}
      unit="bodov"
      title="Bull Challenge"
      hydrated={hydrated}
      running={!!game}
      intro={`V každom kole máš 3 šípky na bull. Bull (červený, stred) = 50 bodov, 25 (zelený prstenec) = 25 bodov, inde sa neráta nič. Kým aspoň jednou šípkou v kole trafíš bull alebo 25, ideš ďalej. Keď netrafíš ani jednou z troch, hra končí a ráta sa tvoje skóre.${best !== null ? ` Tvoj rekord: ${best} bodov.` : ''}`}
      onStart={() => setGame(newBull())}
      top={game ? `Kolo ${roundNo}` : ''}
      big={String(score)}
      sub={
        game && !game.done
          ? `Šípka ${current.length + 1} z 3 · toto kolo ${current.reduce<number>((a, b) => a + b, 0)}`
          : `Kolá so zásahom ${survived}`
      }
      bottom={game ? (game.done ? 'Game over' : 'Traf bull alebo 25') : ''}
      done={!!game?.done}
      result={`${score} bodov · ${survived} ${survived === 1 ? 'kolo' : survived >= 2 && survived <= 4 ? 'kolá' : 'kôl'}`}
      shareScore={`${score} b.`}
      stats={
        game
          ? [
              { label: 'Skóre', value: String(score) },
              { label: 'Kolá so zásahom', value: String(survived) },
              { label: 'Šípky', value: String(darts.length) },
              { label: 'Bull (50)', value: String(bulls) },
              { label: '25', value: String(outer) },
              { label: 'Úspešnosť zásahov', value: pct(bulls + outer, darts.length) },
              { label: 'Najlepšie kolo', value: String(Math.max(0, ...roundScores)) },
            ]
          : []
      }
      onFinish={() => finish('bull')}
      onUndo={() => game && setGame(bullUndo(game))}
      canUndo={darts.length > 0}
      onCancel={() => setGame(null)}
    >
      <Txt className="text-muted text-center text-[13px]">Kam padla šípka?</Txt>
      <View className="flex-row gap-2">
        <PadButton label="Bull 50" selected onPress={() => throwDart(50)} />
        <PadButton label="25" selected onPress={() => throwDart(25)} />
      </View>
      <View className="flex-row gap-2">
        <PadButton label="Mimo" onPress={() => throwDart(0)} />
      </View>
    </TrainingScreen>
  );
}

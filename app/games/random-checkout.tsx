import { useState } from 'react';
import { View } from 'react-native';
import { Txt } from '@/components/DartsUI';
import { PadButton } from '@/components/GameBoard';
import { OptionPicker, TrainingScreen } from '@/components/TrainingUI';
import { feedback } from '@/lib/darts';
import {
  RC_DART_OPTIONS,
  ROUND_OPTIONS,
  checkoutRoute,
  endTraining,
  newRandomCheckout,
  rcPoints,
  rcRound,
  rcTarget,
  rcUndo,
  roundOf,
  roundsLabel,
  useExtraGames,
  type RcDarts,
  type RoundsCount,
} from '@/lib/games';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '–');

export default function RandomCheckout() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.randomCheckout);
  const setGame = useExtraGames((s) => s.setRandomCheckout);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.rcBest ?? null);
  const [rounds, setRounds] = useState<RoundsCount>(10);
  const [darts, setDarts] = useState<RcDarts>(3);
  const played = game ? game.results.length : 0;
  const target = game && !game.done ? rcTarget(game) : null;
  const points = game ? rcPoints(game) : 0;
  const closedList = game ? game.targets.filter((_, i) => game.results[i]) : [];
  const closed = closedList.length;
  return (
    <TrainingScreen
      title="Random Checkout"
      hydrated={hydrated}
      running={!!game}
      intro={`Appka ti dáva náhodné zatvoriteľné čísla od 2 do 170 (double out). Na každé máš vybraný počet šípok. Keď ho zatvoríš, dostaneš body vo výške čísla, keď nie, nevadí — ide sa ďalej na nové číslo. ∞ = hráš, kým tréning neukončíš.${best !== null ? ` Tvoj rekord: ${best} bodov.` : ''}`}
      introExtra={
        <View className="gap-4">
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
          <OptionPicker
            label="Koľko šípok na číslo?"
            options={RC_DART_OPTIONS}
            value={darts}
            format={String}
            onChange={(v) => {
              setDarts(v);
              feedback.selection();
            }}
          />
        </View>
      }
      onStart={() => setGame(newRandomCheckout(rounds, darts))}
      top={game ? `${roundOf(played + 1, game.rounds)} · body ${points}` : ''}
      big={target !== null ? String(target) : String(points)}
      sub={target !== null ? `Cesta: ${checkoutRoute(target)}` : `Zatvorené ${closed} z ${played}`}
      bottom={
        game && target !== null ? `Zatvor ${target} do ${game.darts} šípok` : 'Koniec tréningu'
      }
      done={!!game?.done}
      result={`${points} bodov · zatvorené ${closed} z ${played}`}
      shareScore={`${points} b.`}
      stats={
        game
          ? [
              { label: 'Šípky na číslo', value: String(game.darts) },
              { label: 'Odohrané kolá', value: String(played) },
              { label: 'Zatvorené', value: `${closed} z ${played}` },
              { label: 'Úspešnosť', value: pct(closed, played) },
              { label: 'Body', value: String(points) },
              {
                label: 'Najvyššie zatvorené',
                value: closed ? String(Math.max(...closedList)) : '–',
              },
              {
                label: 'Priemerné zatvorené číslo',
                value: closed ? (points / closed).toFixed(0) : '–',
              },
            ]
          : []
      }
      onFinish={() => finish('randomCheckout')}
      onUndo={() => game && setGame(rcUndo(game))}
      canUndo={!!game?.results.length}
      onEnd={
        game && game.rounds === null && played > 0 ? () => setGame(endTraining(game)) : undefined
      }
      onCancel={() => setGame(null)}
    >
      <Txt className="text-muted text-center text-[13px]">
        Zatvoril si do {game?.darts ?? darts} šípok?
      </Txt>
      <View className="flex-row gap-2">
        <PadButton
          label="Zatvoril"
          selected
          onPress={() => {
            if (!game) return;
            setGame(rcRound(game, true));
            feedback.success();
          }}
        />
        <PadButton
          label="Nezatvoril"
          onPress={() => {
            if (!game) return;
            setGame(rcRound(game, false));
            feedback.selection();
          }}
        />
      </View>
    </TrainingScreen>
  );
}

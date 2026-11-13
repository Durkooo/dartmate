import { useState } from 'react';
import { View } from 'react-native';
import { TrainingScreen } from '@/components/TrainingUI';
import { PadButton } from '@/components/GameBoard';
import { Txt } from '@/components/DartsUI';
import { feedback } from '@/lib/darts';
import {
  C121_ATTEMPTS,
  C121_DART_OPTIONS,
  C121_START,
  c121Attempt,
  c121Undo,
  newC121,
  useExtraGames,
  type C121Darts,
} from '@/lib/games';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '–');

export default function Checkout121() {
  const hydrated = useExtraGames((s) => s.hydrated);
  const game = useExtraGames((s) => s.c121);
  const setGame = useExtraGames((s) => s.setC121);
  const finish = useExtraGames((s) => s.finish);
  const best = useExtraGames((s) => s.records.c121Best);
  const [darts, setDarts] = useState<C121Darts>(9);
  const gameDarts = game?.darts ?? 9;
  return (
    <TrainingScreen
      title="121"
      hydrated={hydrated}
      running={!!game}
      intro={`Začína sa na ${C121_START}. Na každý pokus máš vybraný počet šípok, aby si číslo zatvoril na double. Keď zatvoríš, ďalší cieľ je o 1 vyšší. Keď nezatvoríš, začínaš znova od ${C121_START}. Hrá sa ${C121_ATTEMPTS} pokusov.${best !== null ? ` Tvoj rekord: zatvorené ${best}.` : ''}`}
      introExtra={
        <View className="gap-2">
          <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Koľko šípok na pokus?</Txt>
          <View className="flex-row gap-2">
            {C121_DART_OPTIONS.map((n) => (
              <PadButton
                key={n}
                label={String(n)}
                accessibilityLabel={`${n} šípok na pokus`}
                selected={darts === n}
                onPress={() => {
                  setDarts(n);
                  feedback.selection();
                }}
              />
            ))}
          </View>
        </View>
      }
      onStart={() => setGame(newC121(darts))}
      top={game ? `Pokus ${Math.min(game.attempt + 1, C121_ATTEMPTS)} z ${C121_ATTEMPTS}` : ''}
      big={game ? String(game.target) : ''}
      sub={game ? `Zatvorené ${game.successes} · ${gameDarts} šípok na pokus` : undefined}
      bottom={
        game ? (game.done ? 'Koniec tréningu' : `Zatvor ${game.target} do ${gameDarts} šípok`) : ''
      }
      done={!!game?.done}
      result={
        game ? (game.best ? `Najvyššie zatvorené ${game.best}` : 'Tentoraz bez zatvorenia') : ''
      }
      shareScore={game ? (game.best ? String(game.best) : '–') : ''}
      stats={
        game
          ? [
              { label: 'Šípky na pokus', value: String(gameDarts) },
              { label: 'Zatvorené', value: `${game.successes} z ${game.attempt}` },
              { label: 'Úspešnosť', value: pct(game.successes, game.attempt) },
              { label: 'Najvyššie zatvorené', value: game.best ? String(game.best) : '–' },
              { label: 'Najdlhšia séria', value: String(game.bestStreak ?? 0) },
            ]
          : []
      }
      onFinish={() => finish('c121')}
      onUndo={() => game && setGame(c121Undo(game))}
      canUndo={!!game?.past.length}
      onCancel={() => setGame(null)}
    >
      <Txt className="text-muted text-center text-[13px]">Zatvoril si do {gameDarts} šípok?</Txt>
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

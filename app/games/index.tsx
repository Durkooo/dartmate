import { View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { PressableFeedback } from 'heroui-native';
import { ChevronRight } from 'lucide-react-native';
import { Page, Heading, Txt, LoadingRows } from '@/components/DartsUI';
import { palette } from '@/lib/darts';
import { useExtraGames } from '@/lib/games';

function GameRow({
  title,
  detail,
  record,
  href,
  running,
}: {
  title: string;
  detail: string;
  record?: string;
  href: Href;
  running: boolean;
}) {
  return (
    <PressableFeedback
      onPress={() => router.push(href)}
      className="border-border flex-row items-center gap-3 border-b py-4"
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View className="flex-1 gap-1">
        <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>
          {title}
          {running ? ' · rozohrané' : ''}
        </Txt>
        <Txt className="text-muted text-[13px]">{detail}</Txt>
        {!!record && <Txt className="text-[13px]">{record}</Txt>}
      </View>
      <ChevronRight size={20} color={palette.muted} />
    </PressableFeedback>
  );
}

export default function Games() {
  const s = useExtraGames();
  const r = s.records;
  return (
    <Page>
      <Stack.Screen options={{ title: 'Tréning' }} />
      {!s.hydrated ? (
        <LoadingRows />
      ) : (
        <View className="mt-3">
          <Heading>Tréning</Heading>
          <Txt className="text-muted mt-1 mb-3 text-[13px]">
            Tréningy pre jedného hráča na tomto telefóne. Výsledky sa ukladajú ako tvoje rekordy.
          </Txt>
          <GameRow
            title="Around the Clock"
            detail="Trafiť 1 až 20 a bull po poradí, čo najmenej šípok"
            record={r.clockBest !== null ? `Rekord: ${r.clockBest} šípok` : undefined}
            href="/games/clock"
            running={!!s.clock}
          />
          <GameRow
            title="Bob's 27"
            detail="Tréning doublov D1–D20 a D-bull, štart 27 bodov"
            record={r.bobsBest !== null ? `Rekord: ${r.bobsBest} bodov` : undefined}
            href="/games/bobs"
            running={!!s.bobs}
          />
          <GameRow
            title="121"
            detail="Zatváranie od 121, 10 pokusov po 3, 6, 9 alebo 12 šípok"
            record={r.c121Best !== null ? `Rekord: zatvorené ${r.c121Best}` : undefined}
            href="/games/c121"
            running={!!s.c121}
          />
          <GameRow
            title="Highscore"
            detail="10 kôl po 3 šípky, čo najvyšší súčet bodov"
            record={
              (r.highscoreBest ?? null) !== null ? `Rekord: ${r.highscoreBest} bodov` : undefined
            }
            href="/games/highscore"
            running={!!s.highscore}
          />
          <GameRow
            title="Finishing 50"
            detail="20 náhodných zatvorení od 2 do 50 na 3 šípky"
            record={(r.finishBest ?? null) !== null ? `Rekord: ${r.finishBest} bodov` : undefined}
            href="/games/finishing"
            running={!!s.finishing}
          />
        </View>
      )}
    </Page>
  );
}

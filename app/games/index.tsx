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
      <Stack.Screen options={{ title: 'Ďalšie hry' }} />
      {!s.hydrated ? (
        <LoadingRows />
      ) : (
        <View className="mt-3">
          <Heading>Ďalšie hry</Heading>
          <Txt className="text-muted mt-1 mb-3 text-[13px]">
            Hrajú sa na tomto telefóne. Klasické zápasy 301/501 nájdeš pod „Hrať offline“.
          </Txt>
          <GameRow
            title="Cricket"
            detail="Dvaja hráči · zavri 20–15 a bull, body za zavreté čísla"
            record={r.cricketPlayed ? `Výhry ${r.cricketWins} z ${r.cricketPlayed}` : undefined}
            href="/games/cricket"
            running={!!s.cricket}
          />
          <Txt className="text-muted mt-6 text-[12px] uppercase">Tréning</Txt>
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
            detail="Zatváranie od 121, 10 pokusov po 9 šípok"
            record={r.c121Best !== null ? `Rekord: zatvorené ${r.c121Best}` : undefined}
            href="/games/c121"
            running={!!s.c121}
          />
        </View>
      )}
    </Page>
  );
}

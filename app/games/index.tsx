import { Image, View, type ImageSourcePropType } from 'react-native';
import { TRAINING_ICONS } from '@/lib/trainingIcons';
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
  icon,
}: {
  icon?: ImageSourcePropType;
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
      {!!icon && (
        <Image
          source={icon}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: 56, height: 56, borderRadius: 14 }}
        />
      )}
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
            icon={TRAINING_ICONS.clock}
            detail="Trafiť 1 až 20 a bull po poradí, čo najmenej šípok"
            record={r.clockBest !== null ? `Rekord: ${r.clockBest} šípok` : undefined}
            href="/games/clock"
            running={!!s.clock}
          />
          <GameRow
            title="Bob's 27"
            icon={TRAINING_ICONS.bobs}
            detail="Tréning doublov D1–D20 a D-bull, štart 27 bodov"
            record={r.bobsBest !== null ? `Rekord: ${r.bobsBest} bodov` : undefined}
            href="/games/bobs"
            running={!!s.bobs}
          />
          <GameRow
            title="121"
            icon={TRAINING_ICONS.c121}
            detail="Zatváranie od 121, 5–20 alebo ∞ pokusov po 3–12 šípok"
            record={r.c121Best !== null ? `Rekord: zatvorené ${r.c121Best}` : undefined}
            href="/games/c121"
            running={!!s.c121}
          />
          <GameRow
            title="Highscore"
            icon={TRAINING_ICONS.highscore}
            detail="5–20 alebo ∞ kôl po 3 šípky, čo najvyšší súčet"
            record={
              (r.highscoreBest ?? null) !== null ? `Rekord: ${r.highscoreBest} bodov` : undefined
            }
            href="/games/highscore"
            running={!!s.highscore}
          />
          <GameRow
            title="Finishing 50"
            icon={TRAINING_ICONS.finishing}
            detail="Náhodné zatvorenia od 2 do 50 na 3 šípky, 5–20 alebo ∞ kôl"
            record={(r.finishBest ?? null) !== null ? `Rekord: ${r.finishBest} bodov` : undefined}
            href="/games/finishing"
            running={!!s.finishing}
          />
          <GameRow
            title="Random Checkout"
            icon={TRAINING_ICONS.randomCheckout}
            detail="Náhodné zatvorenia 2–170 na 3, 6 alebo 9 šípok"
            record={(r.rcBest ?? null) !== null ? `Rekord: ${r.rcBest} bodov` : undefined}
            href="/games/random-checkout"
            running={!!s.randomCheckout}
          />
          <GameRow
            title="Bull Challenge"
            icon={TRAINING_ICONS.bull}
            detail="3 šípky na bull (50) alebo 25, kolo bez zásahu = koniec"
            record={(r.bullBest ?? null) !== null ? `Rekord: ${r.bullBest} bodov` : undefined}
            href="/games/bull"
            running={!!s.bull}
          />
        </View>
      )}
    </Page>
  );
}

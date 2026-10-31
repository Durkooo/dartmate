import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Button, PressableFeedback } from 'heroui-native';
import { ArrowUpRight, Target, Video, ChevronRight, Trophy } from 'lucide-react-native';
import { Page, Txt, Heading, FriendRow, StorageNotice, LoadingRows } from '@/components/DartsUI';
import { Dartboard } from '@/components/Dartboard';
import { palette, useDarts } from '@/lib/darts';

export default function Home() {
  const compact = useWindowDimensions().width < 360;
  const friends = useDarts((s) => s.friends);
  const game = useDarts((s) => s.game);
  const history = useDarts((s) => s.history);
  const hydrated = useDarts((s) => s.hydrated);
  return (
    <Page safeTop>
      <View className="mb-7 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Target size={28} color={palette.ink} strokeWidth={1.8} />
          <Txt className="text-[28px]" style={{ fontFamily: 'Inter_700Bold', letterSpacing: -1 }}>
            oche
          </Txt>
        </View>
        <View className="bg-default rounded-full px-3 py-1.5">
          <Txt className="text-muted text-[12px]">Prototyp</Txt>
        </View>
      </View>
      <StorageNotice />
      <Heading className="mb-5">Ideš na šípky?</Heading>
      <View className="bg-ink overflow-hidden rounded-[24px] p-5">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <Txt
              className="text-[28px] leading-[34px] text-white"
              style={{
                fontFamily: 'Inter_700Bold',
                letterSpacing: -0.8,
                fontSize: compact ? 24 : 28,
                lineHeight: compact ? 30 : 34,
              }}
            >
              Terč doma.{'\n'}Súper kdekoľvek.
            </Txt>
          </View>
          <ArrowUpRight size={25} strokeWidth={1.8} color={palette.yellow} />
        </View>
        <View className="my-4 flex-row items-center justify-between">
          <View style={{ flexShrink: 0, width: compact ? 112 : 144 }}>
            <Txt
              numberOfLines={1}
              className="text-accent"
              style={{
                fontFamily: 'Inter_700Bold',
                letterSpacing: -4,
                fontSize: compact ? 56 : 68,
                lineHeight: compact ? 66 : 76,
              }}
            >
              501
            </Txt>
          </View>
          <View style={{ marginRight: -10 }}>
            <Dartboard size={compact ? 120 : 154} />
          </View>
        </View>
        <Button
          size="lg"
          onPress={() => router.push(game ? '/match' : '/new-match')}
          className="rounded-xl"
        >
          <Button.Label style={{ fontFamily: 'Inter_600SemiBold' }}>
            {game ? 'Pokračovať v zápase' : 'Začať zápas'}
          </Button.Label>
          <ArrowUpRight size={20} color={palette.ink} strokeWidth={1.8} />
        </Button>
      </View>
      <View className="mt-4 mb-7 flex-row items-center gap-2">
        <Video size={16} color={palette.muted} strokeWidth={1.8} />
        <Txt className="text-muted flex-1 text-[12px]">
          Teraz lokálna hra. Online a video pribudnú.
        </Txt>
      </View>
      <View className="flex-row items-center justify-between">
        <Heading className="text-[20px]">Tvoja partia</Heading>
        <Button variant="ghost" size="sm" onPress={() => router.push('/friends')}>
          <Button.Label>Všetci</Button.Label>
          <ChevronRight size={16} color={palette.ink} />
        </Button>
      </View>
      <Txt className="text-muted mt-1 text-[12px]">Ukážkoví hráči na vyskúšanie zápasu</Txt>
      {hydrated ? (
        friends
          .slice(0, 3)
          .map((friend) => <FriendRow key={friend.id} friend={friend} action="play" />)
      ) : (
        <LoadingRows />
      )}
      {history.length > 0 && (
        <View className="mt-7">
          <Heading className="mb-3 text-[20px]">Odohrané zápasy</Heading>
          {history.slice(0, 3).map((g) => (
            <View key={g.id} className="border-border flex-row items-center gap-3 border-b py-3">
              <Trophy size={22} color={palette.ink} strokeWidth={1.8} />
              <View className="flex-1">
                <Txt style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
                  {g.winner === 0 ? 'Výhra' : 'Prehra'} proti {g.opponentName}
                </Txt>
                <Txt className="text-muted mt-1 text-[12px]">
                  {g.starting} · {g.doubleOut ? 'Double out' : 'Straight out'} ·{' '}
                  {new Date(g.date).toLocaleDateString('sk-SK')}
                </Txt>
              </View>
            </View>
          ))}
        </View>
      )}
      <PressableFeedback
        className="mt-6 flex-row items-center gap-3 py-3"
        onPress={() => router.push('/new-match')}
      >
        <Target size={20} color={palette.ink} strokeWidth={1.8} />
        <Txt className="flex-1" style={{ fontFamily: 'Inter_500Medium' }}>
          Tréning pri jednom terči
        </Txt>
        <ChevronRight size={18} color={palette.muted} />
      </PressableFeedback>
    </Page>
  );
}

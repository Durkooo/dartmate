import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Button, PressableFeedback } from 'heroui-native';
import { ArrowUpRight, Target, Video, ChevronRight, Trophy } from 'lucide-react-native';
import { Page, Txt, Heading, FriendRow, StorageNotice, LoadingRows } from '@/components/DartsUI';
import { Dartboard } from '@/components/Dartboard';
import { palette, useDarts } from '@/lib/darts';
import { useCallback, useMemo } from 'react';
import { usePlayers } from '@/lib/players';
import { loadContacts, loadOpenMatches, useOnlineQuery } from '@/lib/online';
import { OpenMatches, OnlineError, Presence } from '@/components/OnlineUI';

function sortedContacts(
  contacts: { user_id: string | null; nickname: string | null; online: boolean | null }[],
) {
  // Online prví, potom podľa abecedy (bez diakritiky, malé písmená).
  return [...contacts].sort((a, b) => {
    const ao = a.online ? 0 : 1;
    const bo = b.online ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const an = (a.nickname ?? '').toLowerCase();
    const bn = (b.nickname ?? '').toLowerCase();
    return an.localeCompare(bn, 'sk');
  });
}

export default function Home() {
  const compact = useWindowDimensions().width < 360;
  const friends = useDarts((s) => s.friends);
  const game = useDarts((s) => s.game);
  const history = useDarts((s) => s.history);
  const hydrated = useDarts((s) => s.hydrated);
  const session = usePlayers((s) => s.session);
  const social = useOnlineQuery(
    session ? `home:${session.user.id}` : null,
    useCallback(async () => {
      const [contacts, matches] = await Promise.all([loadContacts(), loadOpenMatches()]);
      return { contacts, matches };
    }, []),
  );
  const friendsOnline = useMemo(
    () => (social.data ? sortedContacts(social.data.contacts) : []),
    [social.data],
  );
  return (
    <Page safeTop>
      <View className="mb-7 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Target size={28} color={palette.ink} strokeWidth={1.8} />
          <Txt className="text-[28px]" style={{ fontFamily: 'Inter_700Bold', letterSpacing: -1 }}>
            DartMate
          </Txt>
        </View>
        <Button variant="secondary" size="sm" onPress={() => router.push('/account')}>
          <Button.Label>Môj účet</Button.Label>
        </Button>
      </View>
      <StorageNotice />
      {/* 1) PARTIA: online prví, potom podľa abecedy */}
      <View className="flex-row items-center justify-between">
        <Heading className="text-[20px]">Tvoja partia</Heading>
        <Button variant="ghost" size="sm" onPress={() => router.push('/friends')}>
          <Button.Label>Všetci</Button.Label>
          <ChevronRight size={16} color={palette.ink} />
        </Button>
      </View>
      {session ? (
        social.loading ? (
          <LoadingRows />
        ) : friendsOnline.length ? (
          friendsOnline.slice(0, 5).map((contact) => (
            <PressableFeedback
              key={contact.user_id}
              className="flex-row items-center gap-2 py-2"
              onPress={() =>
                router.push({
                  pathname: '/conversation/[id]',
                  params: { id: contact.user_id ?? '' },
                })
              }
            >
              <Txt
                numberOfLines={1}
                className="flex-1"
                style={{ fontFamily: 'Inter_600SemiBold' }}
              >
                @{contact.nickname}
              </Txt>
              <Presence inline online={!!contact.online} unknown={!!social.error} />
            </PressableFeedback>
          ))
        ) : (
          <Button variant="outline" className="mt-4" onPress={() => router.push('/friend/new')}>
            <Button.Label>Pridať priateľa podľa nicku</Button.Label>
          </Button>
        )
      ) : (
        <>
          <Txt className="text-muted mt-1 text-[12px]">
            Ukážkoví hráči na vyskúšanie lokálneho zápasu
          </Txt>
          {hydrated ? (
            friends
              .slice(0, 3)
              .map((friend) => <FriendRow key={friend.id} friend={friend} action="play" />)
          ) : (
            <LoadingRows />
          )}
        </>
      )}
      <OnlineError error={social.error} retry={() => void social.refresh()} />
      {/* 2) POZVÁNKY a rozhrané zápasy */}
      {social.data && session && (
        <OpenMatches matches={social.data.matches} userId={session.user.id} />
      )}
      {/* 3) RÁMIK pod pozvánkami */}
      <View className="bg-ink mt-4 overflow-hidden rounded-[24px] p-5">
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
        <Button size="lg" onPress={() => router.push('/online')} className="rounded-xl">
          <Button.Label style={{ fontFamily: 'Inter_600SemiBold' }}>Hrať online</Button.Label>
          <ArrowUpRight size={20} color={palette.ink} strokeWidth={1.8} />
        </Button>
      </View>
      <View className="mt-4 mb-7 flex-row items-center gap-2">
        <Video size={16} color={palette.muted} strokeWidth={1.8} />
        <Txt className="text-muted flex-1 text-[12px]">
          Kamera je voliteľná · skóre zadávaš ručne
        </Txt>
      </View>
      {game && (
        <Button className="mt-5" variant="secondary" onPress={() => router.push('/match')}>
          <Button.Label>Pokračovať v lokálnom zápase</Button.Label>
        </Button>
      )}
      {history.length > 0 && (
        <View className="mt-7">
          <Heading className="mb-3 text-[20px]">Lokálne výsledky</Heading>
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

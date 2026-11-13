import { View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button, PressableFeedback } from 'heroui-native';
import { Target, ChevronRight } from 'lucide-react-native';
import { Page, Txt, Heading, FriendRow, StorageNotice, LoadingRows } from '@/components/DartsUI';
import { Dartboard } from '@/components/Dartboard';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, useDarts } from '@/lib/darts';
import { useExtraGames } from '@/lib/games';
import { useCallback, useMemo, useState } from 'react';
import { usePlayers } from '@/lib/players';
import {
  hasUnread,
  loadContacts,
  loadOpenMatches,
  loadReadChats,
  useOnlineQuery,
} from '@/lib/online';
import { OpenMatches, OnlineError, Presence, UnreadEnvelope } from '@/components/OnlineUI';

function sortedContacts(
  contacts: {
    user_id: string | null;
    nickname: string | null;
    online: boolean | null;
    in_match?: boolean | null;
    last_sender_id?: string | null;
    last_message_at?: string | null;
  }[],
  myId: string,
  read: Record<string, string>,
) {
  // Najprv neprečítaní + online, potom online, potom offline; v skupinách abecedne.
  const tier = (c: (typeof contacts)[number]) =>
    hasUnread(c, myId, read) && c.online ? 0 : c.online ? 1 : 2;
  return [...contacts].sort((a, b) => {
    const t = tier(a) - tier(b);
    if (t !== 0) return t;
    const an = (a.nickname ?? '').toLowerCase();
    const bn = (b.nickname ?? '').toLowerCase();
    return an.localeCompare(bn, 'sk');
  });
}

/** Smery posunu čiernych kópií nápisu (obrys). */
const OUTLINE = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

export default function Home() {
  const compact = useWindowDimensions().width < 360;
  // Karta je široká ako obsah stránky (max-w-xl = 576 px), na tablete nerastie ďalej.
  const cardWidth = Math.min(useWindowDimensions().width - 40, 576);
  const boardSize = cardWidth * 1.0;
  // Karta je o niečo vyššia, aby sa zmestili tlačidlá nad aj pod nápisom.
  const cardHeight = cardWidth * 1.12;
  // Šírka miesta pre nápis — písmo sa jej prispôsobí (na výšku menšie, na šírku väčšie).
  const [titleWidth, setTitleWidth] = useState(0);
  const titleFont = titleWidth > 0 ? Math.round((titleWidth + 32) / 4.77) : compact ? 68 : 84;
  // Hrúbka obrysu nápisu a písmo tlačidiel podľa veľkosti displeja.
  const outline = Math.max(2, Math.round(titleFont / 28));
  const buttonFont = cardWidth < 300 ? 14 : cardWidth > 500 ? 18 : 16;
  const titleStyle = {
    fontFamily: 'Inter_700Bold',
    letterSpacing: -4,
    fontSize: titleFont,
    lineHeight: Math.round(titleFont * 1.12),
  } as const;
  const friends = useDarts((s) => s.friends);
  const game = useDarts((s) => s.game);
  const cricketRunning = useExtraGames((s) => !!s.cricket);
  const hydrated = useDarts((s) => s.hydrated);
  const session = usePlayers((s) => s.session);
  const social = useOnlineQuery(
    session ? `home:${session.user.id}` : null,
    useCallback(async () => {
      const [contacts, matches] = await Promise.all([loadContacts(), loadOpenMatches()]);
      return { contacts, matches };
    }, []),
  );
  const [read, setRead] = useState<Record<string, string>>({});
  useFocusEffect(
    useCallback(() => {
      void loadReadChats().then(setRead);
    }, []),
  );
  const friendsOnline = useMemo(
    () =>
      session ? sortedContacts(social.data?.contacts ?? [], session.user.id, read).slice(0, 3) : [],
    [social.data, session, read],
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
          friendsOnline.map((contact) => (
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
              <Txt numberOfLines={1} className="flex-1" style={{ fontFamily: 'Inter_600SemiBold' }}>
                @{contact.nickname}
              </Txt>
              {session && hasUnread(contact, session.user.id, read) ? <UnreadEnvelope /> : null}
              <Presence
                inline
                online={!!contact.online}
                playing={!!contact.in_match}
                unknown={!!social.error}
              />
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
      {/* 3) KARTA vo farbách skóre boxu zo zápasu: tmavomodrá, žltá, svetlomodrošedá.
          Terč je dekorácia v pravom hornom rohu, texty a tlačidlá vľavo dole. */}
      <View className="bg-ink mt-4 overflow-hidden rounded-[28px]" style={{ height: cardHeight }}>
        <View
          className="absolute"
          style={{
            width: boardSize,
            height: boardSize,
            right: -boardSize * 0.32,
            top: -boardSize * 0.36,
          }}
        >
          <Dartboard dart={false} tone="board" size={boardSize} />
        </View>
        {/* Prechod do tmavomodrej, aby texty a tlačidlá ostali čitateľné. */}
        <LinearGradient
          colors={[palette.ink, 'rgba(25,36,56,0.92)', 'rgba(25,36,56,0.15)']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.85, y: 0 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <View className="absolute inset-0 justify-between p-5 pb-6">
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <View className="bg-accent h-1.5 w-1.5 rounded-full" />
              <View className="bg-accent h-1.5 w-6 rounded-full" />
            </View>
            <Txt
              style={{
                fontFamily: 'Inter_700Bold',
                letterSpacing: -0.8,
                fontSize: compact ? 24 : 28,
                lineHeight: compact ? 30 : 34,
                color: palette.white,
              }}
            >
              Terč doma.{'\n'}
              <Txt
                style={{
                  fontFamily: 'Inter_700Bold',
                  letterSpacing: -0.8,
                  fontSize: compact ? 24 : 28,
                  lineHeight: compact ? 30 : 34,
                  color: palette.yellow,
                }}
              >
                Súper kdekoľvek.
              </Txt>
            </Txt>
          </View>
          <View>
            {/* Online a offline hra nad nápisom, každé na polovicu šírky. */}
            <View className="mb-2 flex-row gap-2">
              {(
                [
                  ['Hrať online', '/online'],
                  ['Hrať offline', '/new-match'],
                ] as const
              ).map(([text, href]) => (
                <Button
                  key={href}
                  size="lg"
                  onPress={() => router.push(href)}
                  className="flex-1 rounded-2xl px-2"
                >
                  <Button.Label
                    numberOfLines={1}
                    style={{ fontFamily: 'Inter_700Bold', fontSize: buttonFont }}
                  >
                    {text}
                  </Button.Label>
                </Button>
              ))}
            </View>
            <View
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (Math.abs(w - titleWidth) > 1) setTitleWidth(w);
              }}
            >
              {/* Nápis s hrubým čiernym obrysom: čierne kópie posunuté do 8 smerov
                  pod žltým textom (funguje na webe aj v mobile). */}
              <View style={{ position: 'relative' }}>
                {OUTLINE.map(([dx, dy]) => (
                  <Txt
                    key={`${dx}:${dy}`}
                    aria-hidden
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    numberOfLines={1}
                    style={{
                      ...titleStyle,
                      position: 'absolute',
                      left: dx * outline,
                      top: dy * outline,
                      color: '#000',
                    }}
                  >
                    DartMate
                  </Txt>
                ))}
                <Txt numberOfLines={1} className="text-accent" style={titleStyle}>
                  DartMate
                </Txt>
              </View>
            </View>
            {/* Tréning pod nápisom, cca 3/4 šírky karty. */}
            <Button
              size="lg"
              onPress={() => router.push('/games')}
              className="mt-2 self-center rounded-2xl"
              style={{ width: '75%' }}
            >
              <Button.Label
                numberOfLines={1}
                style={{ fontFamily: 'Inter_700Bold', fontSize: buttonFont }}
              >
                Tréning
              </Button.Label>
            </Button>
          </View>
        </View>
        {/* Žltý pásik dole ako pri skóre boxe v zápase. */}
        <View className="bg-accent absolute right-0 bottom-0 left-0" style={{ height: 6 }} />
      </View>
      {game && (
        <Button className="mt-5" variant="secondary" onPress={() => router.push('/match')}>
          <Button.Label>Pokračovať v lokálnom zápase</Button.Label>
        </Button>
      )}
      {cricketRunning && (
        <Button className="mt-3" variant="secondary" onPress={() => router.push('/games/cricket')}>
          <Button.Label>Pokračovať v Crickete</Button.Label>
        </Button>
      )}
    </Page>
  );
}

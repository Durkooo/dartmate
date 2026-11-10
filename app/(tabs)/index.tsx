import { View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button, PressableFeedback } from 'heroui-native';
import { Target, ChevronRight, Trophy } from 'lucide-react-native';
import { Page, Txt, Heading, FriendRow, StorageNotice, LoadingRows } from '@/components/DartsUI';
import { Dartboard } from '@/components/Dartboard';
import { palette, useDarts } from '@/lib/darts';
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

export default function Home() {
  const compact = useWindowDimensions().width < 360;
  const cardWidth = useWindowDimensions().width - 40;
  const boardSize = cardWidth * 1.8;
  // Šírka miesta pre nápis — písmo sa jej prispôsobí (na výšku menšie, na šírku väčšie).
  const [titleWidth, setTitleWidth] = useState(0);
  const titleFont = titleWidth > 0 ? Math.round((titleWidth + 32) / 4.77) : compact ? 68 : 84;
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
      {/* 3) RÁMIK pod pozvánkami — terč na celej ploche */}
      <View className="bg-ink mt-4 overflow-hidden rounded-[24px]">
        <View style={{ height: cardWidth * 1.08 }} className="relative w-full">
          <View
            className="absolute"
            style={{
              width: boardSize,
              height: boardSize,
              left: (cardWidth - boardSize) / 2,
              top: (cardWidth * 1.08 - boardSize) / 2,
            }}
          >
            <Dartboard dart={false} size={boardSize} />
          </View>
          <View
            className="absolute inset-0"
            style={{ backgroundColor: palette.ink, opacity: 0.45 }}
          />
          <View className="absolute inset-0 justify-between p-5">
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
            <View>
              <View
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (Math.abs(w - titleWidth) > 1) setTitleWidth(w);
                }}
              >
                <Txt
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  className="text-accent"
                  style={{
                    fontFamily: 'Inter_700Bold',
                    letterSpacing: -4,
                    fontSize: titleFont,
                    lineHeight: Math.round(titleFont * 1.12),
                  }}
                >
                  DartMate
                </Txt>
              </View>
              <View className="mt-3 flex-row gap-2">
                <Button
                  size="md"
                  onPress={() => router.push('/online')}
                  className="flex-1 rounded-xl"
                >
                  <Button.Label style={{ fontFamily: 'Inter_600SemiBold' }}>
                    Hrať online
                  </Button.Label>
                </Button>
                <Button
                  size="md"
                  variant="secondary"
                  onPress={() => router.push('/new-match')}
                  className="flex-1 rounded-xl"
                >
                  <Button.Label style={{ fontFamily: 'Inter_600SemiBold' }}>
                    Hrať offline
                  </Button.Label>
                </Button>
              </View>
            </View>
          </View>
        </View>
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
                  {g.solo
                    ? `Sólo hra · ${g.starting}`
                    : `${g.winner === 0 ? 'Výhra' : 'Prehra'} proti ${g.opponentName}`}
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
    </Page>
  );
}

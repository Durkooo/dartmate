import { View, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { Button, PressableFeedback } from 'heroui-native';
import { router } from 'expo-router';
import { ChevronRight, Mail, Swords, Wifi, WifiOff } from 'lucide-react-native';
import { Empty, Heading, LoadingRows, Txt } from '@/components/DartsUI';
import { feedback, palette, CARD_ROW } from '@/lib/darts';
import { opponentName, respondMatch, type OnlineMatch } from '@/lib/online';
import { playerError, usePlayers } from '@/lib/players';

/** „pred 5 min“, „pred 2 h“, „včera“, „pred 3 dňami“, inak dátum. */
export function formatLastSeen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'práve teraz';
  if (mins < 60) return `pred ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? 'pred hodinou' : `pred ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 2) return 'včera';
  if (days < 7) return `pred ${days} dňami`;
  return new Date(then).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' });
}

export function OnlineGate({ children }: { children: React.ReactNode }) {
  const session = usePlayers((s) => s.session);
  const profile = usePlayers((s) => s.profile);
  const ready = usePlayers((s) => s.ready);
  const loading = usePlayers((s) => s.loading);
  const error = usePlayers((s) => s.error);
  if (!ready || (session && loading && !profile)) return <LoadingRows />;
  if (error && !profile)
    return <OnlineError error={error} retry={() => void usePlayers.getState().refresh()} />;
  if (!session || !profile)
    return (
      <Empty
        text={
          session ? 'Vyber si nick pre online hranie.' : 'Prihlás sa pre online hranie a správy.'
        }
        action={session ? 'Vybrať nick' : 'Prihlásiť sa'}
        onPress={() => router.push('/account')}
      />
    );
  return children;
}
export function OnlineError({ error, retry }: { error: string; retry: () => void }) {
  if (!error) return null;
  return (
    <View className="bg-danger-soft my-4 gap-3 rounded-xl p-4">
      <Txt className="text-danger" accessibilityRole="alert">
        {error}
      </Txt>
      <Button variant="danger-soft" onPress={retry}>
        <Button.Label>Skúsiť znova</Button.Label>
      </Button>
    </View>
  );
}
export function Presence({
  online,
  unknown = false,
  inline = false,
  playing = false,
  lastSeen = null,
}: {
  online: boolean;
  unknown?: boolean;
  inline?: boolean;
  /** Práve hrá online zápas — oranžová bodka a text. */
  playing?: boolean;
  /** ISO čas poslednej aktivity — pri offline ukáže „naposledy pred …“. */
  lastSeen?: string | null;
}) {
  // Online bodka bliká (opacity 1 ↔ 0.25), nápis „Online" ostáva stále zelený.
  // Hodnota vznikne raz pri prvom vykreslení (inicializátor useState).
  const [blink] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if ((!online && !playing) || unknown) {
      blink.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [online, playing, unknown, blink]);
  const color = unknown
    ? palette.muted
    : playing
      ? palette.playing
      : online
        ? palette.success
        : palette.danger;
  return (
    <View
      style={inline ? styles.inlineRow : undefined}
      className={inline ? undefined : 'flex-row items-center gap-1.5'}
    >
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: unknown ? palette.muted : online ? palette.success : color,
            opacity: blink,
          },
        ]}
      />
      <Txt
        numberOfLines={1}
        style={{ color, fontSize: inline ? 13 : 12 }}
        className={inline ? undefined : 'text-[12px]'}
      >
        {unknown
          ? 'Stav neznámy'
          : playing
            ? 'Práve hrá'
            : online
              ? 'Online'
              : lastSeen
                ? `Offline · naposledy ${formatLastSeen(lastSeen)}`
                : 'Offline'}
      </Txt>
    </View>
  );
}
/** Blikajúca čierna obálka = neprečítaná správa od priateľa. */
export function UnreadEnvelope() {
  const [blink] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);
  return (
    <Animated.View style={{ opacity: blink }}>
      <Mail size={16} color={palette.ink} strokeWidth={1.8} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});
export function SyncStatus({ error, syncedAt }: { error: string; syncedAt: number }) {
  return (
    <View className="flex-row items-center gap-2 py-3">
      {error ? (
        <WifiOff size={16} color={palette.danger} strokeWidth={1.8} />
      ) : (
        <Wifi size={16} color={palette.muted} strokeWidth={1.8} />
      )}
      <Txt className={error ? 'text-danger flex-1 text-[12px]' : 'text-muted flex-1 text-[12px]'}>
        {error
          ? 'Spojenie prerušené · skóre nie je aktuálne'
          : syncedAt
            ? `Obnovené o ${new Date(syncedAt).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
            : 'Pripájam…'}
      </Txt>
    </View>
  );
}
export function MatchRow({
  match,
  userId,
  stats = false,
}: {
  match: OnlineMatch;
  userId: string;
  /** Po ťuknutí otvorí štatistiky zápasu namiesto detailu/hry. */
  stats?: boolean;
}) {
  const incoming = match.guest_id === userId;
  const label =
    match.status === 'active'
      ? 'Rozhraný zápas'
      : match.status === 'finished'
        ? match.winner_id === userId
          ? 'Výhra'
          : 'Prehra'
        : match.status === 'invited'
          ? incoming
            ? 'Pozýva ťa na zápas'
            : 'Čaká na odpoveď'
          : match.status === 'declined'
            ? 'Odmietnutý'
            : 'Zrušený';
  return (
    <PressableFeedback
      onPress={() =>
        router.push(
          stats
            ? { pathname: '/online/stats/[id]', params: { id: match.id } }
            : { pathname: '/online/[id]', params: { id: match.id } },
        )
      }
      className={CARD_ROW}
    >
      <View className="flex-1 gap-1">
        <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
          @{opponentName(match, userId)}
        </Txt>
        <Txt className="text-muted text-[13px]">
          {label} · {match.starting}
          {stats ? ` · ${new Date(match.created_at).toLocaleDateString('sk-SK')} · Online` : ''}
        </Txt>
      </View>
      <ChevronRight size={20} color={palette.ink} strokeWidth={1.8} />
    </PressableFeedback>
  );
}
export function OpenMatches({ matches, userId }: { matches: OnlineMatch[]; userId: string }) {
  if (!matches.length) return null;
  return (
    <View className="my-6">
      <Heading className="mb-2 text-[20px]">Pozvánky a zápasy</Heading>
      {matches.map((m) => (
        <MatchRow key={m.id} match={m} userId={userId} />
      ))}
    </View>
  );
}
/**
 * Pozvánka na zápas ako správa v chate (konverzácia s priateľom).
 * Prijať = rovno do zápasu, odmietnuť/zrušiť = zmizne po obnovení.
 */
export function MatchInviteCard({
  match,
  userId,
  onChanged,
}: {
  match: OnlineMatch;
  userId: string;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (match.status !== 'invited') return null;
  const incoming = match.guest_id === userId;
  const legs = (match.legs_to_win ?? 1) > 1 ? ` · na ${match.legs_to_win} víťazné legy` : '';
  const decide = async (decision: 'accept' | 'decline' | 'cancel') => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await respondMatch(match.id, decision);
      feedback.success();
      if (decision === 'accept') {
        router.push({ pathname: '/online/[id]', params: { id: match.id } });
      } else {
        onChanged();
      }
    } catch (e) {
      setError(
        playerError({ message: e instanceof Error ? e.message : 'Akciu sa nepodarilo vykonať.' }),
      );
      feedback.error();
      onChanged();
    } finally {
      setPending(false);
    }
  };
  return (
    <View className="bg-surface my-2 gap-3 rounded-2xl rounded-bl-sm p-4">
      <View className="flex-row items-center gap-2">
        <Swords size={18} color={palette.ink} strokeWidth={1.8} />
        <Txt className="flex-1" style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={2}>
          {incoming
            ? `@${opponentName(match, userId)} ťa pozýva na zápas`
            : 'Pozvánka odoslaná — čakáš na súpera'}
        </Txt>
      </View>
      <Txt className="text-muted text-[13px] leading-5">
        {match.starting} · {match.double_out ? 'double out' : 'straight out'}
        {legs} · kamera voliteľná
      </Txt>
      {!!error && (
        <Txt className="text-danger text-[13px]" accessibilityRole="alert">
          {error}
        </Txt>
      )}
      {incoming ? (
        <View className="flex-row gap-2">
          <Button className="flex-1" isDisabled={pending} onPress={() => void decide('accept')}>
            <Button.Label>{pending ? 'Čakaj…' : 'Prijať zápas'}</Button.Label>
          </Button>
          <Button
            variant="ghost"
            className="flex-1"
            isDisabled={pending}
            onPress={() => void decide('decline')}
          >
            <Button.Label>Odmietnuť</Button.Label>
          </Button>
        </View>
      ) : (
        <Button variant="secondary" isDisabled={pending} onPress={() => void decide('cancel')}>
          <Button.Label>{pending ? 'Čakaj…' : 'Zrušiť pozvánku'}</Button.Label>
        </Button>
      )}
    </View>
  );
}

import { View } from 'react-native';
import { Button, PressableFeedback } from 'heroui-native';
import { router } from 'expo-router';
import { ChevronRight, Wifi, WifiOff } from 'lucide-react-native';
import { Empty, Heading, LoadingRows, Txt } from '@/components/DartsUI';
import { palette } from '@/lib/darts';
import { opponentName, type OnlineMatch } from '@/lib/online';
import { usePlayers } from '@/lib/players';

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
export function Presence({ online, unknown = false }: { online: boolean; unknown?: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View
        style={{
          backgroundColor: online && !unknown ? palette.success : palette.muted,
          width: 6,
          height: 6,
          borderRadius: 3,
        }}
      />
      <Txt className="text-muted text-[12px]" numberOfLines={1}>
        {unknown ? 'Stav neznámy' : online ? 'Online' : 'Offline'}
      </Txt>
    </View>
  );
}
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
export function MatchRow({ match, userId }: { match: OnlineMatch; userId: string }) {
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
      onPress={() => router.push({ pathname: '/online/[id]', params: { id: match.id } })}
      className="border-border flex-row items-center gap-3 border-b py-4"
    >
      <View className="flex-1 gap-1">
        <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
          @{opponentName(match, userId)}
        </Txt>
        <Txt className="text-muted text-[13px]">
          {label} · {match.starting}
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

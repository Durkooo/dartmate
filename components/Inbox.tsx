import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Button, PressableFeedback } from 'heroui-native';
import { router } from 'expo-router';
import { Search, Swords, Trophy, X } from 'lucide-react-native';
import { Avatar, Txt } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';
import { opponentName, respondMatch, type OnlineMatch } from '@/lib/online';
import { TRAINING_ROUTES, TRAINING_TITLES, useChallenge, type Challenge } from '@/lib/challenge';
import { playerError } from '@/lib/players';

/* Správy v štýle „Darts centrum“: hore čo na teba čaká (pozvánky, rozohrané zápasy,
 * výzvy), pod tým hľadanie a konverzácie s rýchlou akciou. */

export type WaitingChallenge = { fromId: string; fromNick: string; challenge: Challenge };

const CARD_W = 184;
const rules = (m: OnlineMatch) =>
  `${m.starting} · First to ${m.legs_to_win ?? 1} · ${m.double_out ? 'double out' : 'straight out'}`;

function WaitingCard({
  icon,
  kind,
  title,
  detail,
  action,
  pending = false,
  onPress,
}: {
  icon: 'swords' | 'trophy';
  kind: string;
  title: string;
  detail: string;
  action: string;
  pending?: boolean;
  onPress: () => void;
}) {
  const Icon = icon === 'swords' ? Swords : Trophy;
  return (
    <View
      className="justify-between gap-2 rounded-2xl p-3"
      style={{ width: CARD_W, backgroundColor: palette.navy }}
    >
      <View className="gap-1">
        <View className="flex-row items-center gap-1.5">
          <Icon size={15} color={palette.yellow} strokeWidth={1.8} />
          <Txt
            className="text-[13px]"
            style={{ fontFamily: 'Inter_700Bold', color: palette.yellow }}
          >
            {kind}
          </Txt>
        </View>
        <Txt numberOfLines={2} style={{ fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>
          {title}
        </Txt>
        <Txt numberOfLines={2} className="text-[12px]" style={{ color: '#BDC8DB' }}>
          {detail}
        </Txt>
      </View>
      <Button size="sm" isDisabled={pending} onPress={onPress}>
        <Button.Label>{action}</Button.Label>
      </Button>
    </View>
  );
}

/** „Čaká na teba“: pozvánky, rozohrané zápasy a výzvy na tréning vedľa seba. */
export function WaitingForYou({
  matches,
  challenges,
  userId,
  onChanged,
}: {
  matches: OnlineMatch[];
  challenges: WaitingChallenge[];
  userId: string;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!matches.length && !challenges.length) return null;
  const decide = async (m: OnlineMatch, decision: 'accept' | 'cancel') => {
    if (pending) return;
    setPending(m.id);
    setError('');
    try {
      await respondMatch(m.id, decision);
      feedback.success();
      if (decision === 'accept') router.push({ pathname: '/online/[id]', params: { id: m.id } });
      else onChanged();
    } catch (e) {
      setError(
        playerError({ message: e instanceof Error ? e.message : 'Akciu sa nepodarilo vykonať.' }),
      );
      feedback.error();
      onChanged();
    } finally {
      setPending(null);
    }
  };
  return (
    <View className="mt-4">
      <Txt
        className="text-muted mb-2 text-[12px]"
        style={{ fontFamily: 'Inter_700Bold', letterSpacing: 0.5 }}
      >
        ČAKÁ NA TEBA
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2.5">
          {matches.map((m) =>
            m.status === 'active' ? (
              <WaitingCard
                key={m.id}
                icon="swords"
                kind="Rozohraný zápas"
                title={`@${opponentName(m, userId)}`}
                detail={rules(m)}
                action="Pokračovať"
                onPress={() => router.push({ pathname: '/online/[id]', params: { id: m.id } })}
              />
            ) : m.guest_id === userId ? (
              <WaitingCard
                key={m.id}
                icon="swords"
                kind="Pozvánka"
                title={`@${opponentName(m, userId)}`}
                detail={rules(m)}
                action="Prijať"
                pending={pending === m.id}
                onPress={() => void decide(m, 'accept')}
              />
            ) : (
              <WaitingCard
                key={m.id}
                icon="swords"
                kind="Čakáš na súpera"
                title={`@${opponentName(m, userId)}`}
                detail={rules(m)}
                action="Zrušiť"
                pending={pending === m.id}
                onPress={() => void decide(m, 'cancel')}
              />
            ),
          )}
          {challenges.map((c) => (
            <WaitingCard
              key={`challenge-${c.fromId}`}
              icon="trophy"
              kind="Výzva"
              title={`@${c.fromNick} · ${TRAINING_TITLES[c.challenge.mode]}`}
              detail={`${c.challenge.lower ? 'Zvládni za' : 'Prekonaj'} ${c.challenge.target}${c.challenge.unit ? ` ${c.challenge.unit}` : ''}`}
              action="Hrať"
              onPress={() => {
                useChallenge
                  .getState()
                  .accept({ ...c.challenge, fromId: c.fromId, fromNick: c.fromNick });
                feedback.success();
                router.push(TRAINING_ROUTES[c.challenge.mode]);
              }}
            />
          ))}
        </View>
      </ScrollView>
      {!!error && <Txt className="text-danger mt-2 text-[13px]">{error}</Txt>}
    </View>
  );
}

/** Okno „Hľadať v správach“ (meno priateľa alebo text poslednej správy). */
export function InboxSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View className="bg-surface mt-4 flex-row items-center gap-2 rounded-2xl px-4">
      <Search size={18} color={palette.muted} strokeWidth={1.8} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Hľadať v správach"
        placeholderTextColor={palette.muted}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Hľadať v správach"
        className="text-foreground flex-1 py-3 text-[15px]"
        style={{ fontFamily: 'Inter_400Regular', outlineStyle: 'none' } as object}
      />
      {!!value && (
        <PressableFeedback accessibilityLabel="Vymazať hľadanie" onPress={() => onChange('')}>
          <X size={18} color={palette.muted} strokeWidth={1.8} />
        </PressableFeedback>
      )}
    </View>
  );
}

/** Avatar s bodkou stavu (online / hrá / trénuje / offline). */
export function PresenceAvatar({
  name,
  avatarUrl,
  online,
  playing,
  training,
  ring,
}: {
  name: string;
  avatarUrl?: string;
  online: boolean;
  playing: boolean;
  training: boolean;
  /** Farba okraja bodky (pozadie karty). */
  ring: string;
}) {
  const dot = playing
    ? palette.playing
    : training
      ? palette.training
      : online
        ? palette.success
        : palette.danger;
  return (
    <View>
      {avatarUrl ? (
        <Avatar friend={{ name, color: 'blue', avatarUrl }} size={48} />
      ) : (
        // Nick nemá medzery — prvé dve písmená veľkými (ako ikony DartMate).
        <View
          className="items-center justify-center"
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: palette.navy }}
        >
          <Txt style={{ fontFamily: 'Inter_700Bold', color: palette.yellow, fontSize: 16 }}>
            {name.slice(0, 2).toUpperCase()}
          </Txt>
        </View>
      )}
      <View
        style={{
          position: 'absolute',
          right: 0,
          bottom: 1,
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 2.5,
          borderColor: ring,
          backgroundColor: dot,
        }}
      />
    </View>
  );
}

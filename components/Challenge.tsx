import { useState } from 'react';
import { View } from 'react-native';
import { Button, PressableFeedback } from 'heroui-native';
import { Swords } from 'lucide-react-native';
import { Avatar, Txt } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';
import { sendChallenge, type Challenge } from '@/lib/challenge';
import { sendResult } from '@/lib/matchResult';
import { usePlayers } from '@/lib/players';

/** „Vyzvať priateľa“: vyber priateľa, pošle mu najprv výsledok tréningu
 *  (obrázok + karta) a hneď za ním výzvu prekonať ho (s tlačidlom Prijať výzvu). */
export function ChallengeButton({
  challenge,
  result,
}: {
  challenge: Challenge;
  /** Výsledok tréningu, ktorý príde priateľovi pred výzvou. */
  result?: { body: string; image: () => Promise<Blob | null> };
}) {
  const myNick = usePlayers((s) => s.profile?.nickname);
  const friends = usePlayers((s) => s.friends).filter((f) => !f.demo);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  if (!myNick || !friends.length) return null;
  return (
    <View className="w-full gap-2">
      {sentTo ? (
        <Txt className="text-center text-[13px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
          Výzva odoslaná @{sentTo} ✓
        </Txt>
      ) : (
        <Button
          variant="tertiary"
          className="w-full"
          isDisabled={sending}
          onPress={() => {
            setOpen((v) => !v);
            feedback.selection();
          }}
        >
          <Swords size={18} color={palette.ink} strokeWidth={1.8} />
          <Button.Label>{sending ? 'Posielam…' : 'Vyzvať priateľa'}</Button.Label>
        </Button>
      )}
      {open && !sentTo && (
        <View className="bg-surface rounded-xl p-2">
          <Txt className="text-muted px-2 pt-1 pb-2 text-[12px]">
            Koho vyzveš, aby prekonal tvoj výsledok?
          </Txt>
          {friends.map((f) => (
            <PressableFeedback
              key={f.id}
              isDisabled={sending}
              className="flex-row items-center gap-3 rounded-xl p-2"
              accessibilityRole="button"
              accessibilityLabel={`Vyzvať @${f.handle}`}
              onPress={() => {
                setSending(true);
                setError('');
                void (
                  result ? sendResult(f.id, myNick, result.body, result.image) : Promise.resolve()
                )
                  .then(() => sendChallenge(f.id, myNick, challenge))
                  .then(() => {
                    setSentTo(f.handle);
                    setOpen(false);
                    feedback.success();
                  })
                  .catch((e: unknown) => {
                    setError(e instanceof Error ? e.message : 'Výzvu sa nepodarilo poslať.');
                    feedback.error();
                  })
                  .finally(() => setSending(false));
              }}
            >
              <Avatar friend={f} size={32} />
              <Txt className="flex-1" numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
                @{f.handle}
              </Txt>
              <Swords size={16} color={palette.muted} strokeWidth={1.8} />
            </PressableFeedback>
          ))}
        </View>
      )}
      {!!error && (
        <Txt className="text-danger text-[13px]" accessibilityRole="alert">
          {error}
        </Txt>
      )}
    </View>
  );
}

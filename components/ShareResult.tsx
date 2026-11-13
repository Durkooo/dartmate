import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, PressableFeedback } from 'heroui-native';
import { Send } from 'lucide-react-native';
import { Avatar, Txt } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';
import { sendResult } from '@/lib/matchResult';
import { usePlayers } from '@/lib/players';

/** Tlačidlo „Poslať výsledok do chatu“. So súperom-priateľom pošle rovno jemu,
 *  inak (bot, sólo, dočasný súper) si vyberieš priateľa zo zoznamu. */
export function ShareResult({
  peerId,
  peerName,
  body,
  image,
}: {
  peerId?: string;
  peerName?: string;
  body: string;
  /** Obrázok tabuľky so štatistikami (posiela sa ako fotka). */
  image?: () => Promise<Blob | null>;
}) {
  const myNick = usePlayers((s) => s.profile?.nickname);
  const friends = usePlayers((s) => s.friends).filter((f) => !f.demo);
  const [sentTo, setSentTo] = useState<{ id: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  if (!myNick || (!peerId && !friends.length)) return null;
  const send = (id: string, name: string) => {
    setSending(true);
    setError('');
    void sendResult(id, myNick, body, image)
      .then(() => {
        setSentTo({ id, name });
        setPicking(false);
        feedback.success();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Výsledok sa nepodarilo poslať.');
        feedback.error();
      })
      .finally(() => setSending(false));
  };
  return (
    <View className="w-full gap-2">
      {sentTo ? (
        <Button
          variant="secondary"
          className="w-full"
          onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: sentTo.id } })}
        >
          <Button.Label>Odoslané ✓ · Otvoriť chat s @{sentTo.name}</Button.Label>
        </Button>
      ) : peerId ? (
        <Button
          variant="secondary"
          className="w-full"
          isDisabled={sending}
          onPress={() => send(peerId, peerName ?? '')}
        >
          <Send size={18} color={palette.yellow} />
          <Button.Label>
            {sending ? 'Posielam…' : `Poslať výsledok @${peerName ?? ''} do chatu`}
          </Button.Label>
        </Button>
      ) : (
        <>
          <Button
            variant="secondary"
            className="w-full"
            isDisabled={sending}
            onPress={() => {
              setPicking((v) => !v);
              feedback.selection();
            }}
          >
            <Send size={18} color={palette.yellow} />
            <Button.Label>{sending ? 'Posielam…' : 'Poslať výsledok priateľovi'}</Button.Label>
          </Button>
          {picking && (
            <View className="bg-surface rounded-xl p-2">
              <Txt className="text-muted px-2 pt-1 pb-2 text-[12px]">Komu poslať výsledok?</Txt>
              {friends.map((f) => (
                <PressableFeedback
                  key={f.id}
                  isDisabled={sending}
                  onPress={() => send(f.id, f.handle)}
                  className="flex-row items-center gap-3 rounded-xl p-2"
                  accessibilityRole="button"
                  accessibilityLabel={`Poslať výsledok @${f.handle}`}
                >
                  <Avatar friend={f} size={32} />
                  <Txt
                    className="flex-1"
                    numberOfLines={1}
                    style={{ fontFamily: 'Inter_600SemiBold' }}
                  >
                    @{f.handle}
                  </Txt>
                  <Send size={16} color={palette.muted} />
                </PressableFeedback>
              ))}
            </View>
          )}
        </>
      )}
      {!!error && (
        <Txt className="text-danger text-[13px]" accessibilityRole="alert">
          {error}
        </Txt>
      )}
    </View>
  );
}

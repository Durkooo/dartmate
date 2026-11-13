import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { Send } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';
import { sendResult } from '@/lib/matchResult';
import { usePlayers } from '@/lib/players';

/** Tlačidlo „Poslať výsledok do chatu“ — len pre zápas s priateľom. */
export function ShareResult({
  peerId,
  peerName,
  body,
}: {
  peerId: string;
  peerName: string;
  body: string;
}) {
  const myNick = usePlayers((s) => s.profile?.nickname);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  if (!myNick || !peerId) return null;
  return (
    <View className="w-full gap-2">
      {state === 'sent' ? (
        <Button
          variant="secondary"
          className="w-full"
          onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: peerId } })}
        >
          <Button.Label>Odoslané ✓ · Otvoriť chat s @{peerName}</Button.Label>
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="w-full"
          isDisabled={state === 'sending'}
          onPress={() => {
            setState('sending');
            setError('');
            void sendResult(peerId, myNick, body)
              .then(() => {
                setState('sent');
                feedback.success();
              })
              .catch((e: unknown) => {
                setState('idle');
                setError(e instanceof Error ? e.message : 'Výsledok sa nepodarilo poslať.');
                feedback.error();
              });
          }}
        >
          <Send size={18} color={palette.ink} />
          <Button.Label>
            {state === 'sending' ? 'Posielam…' : `Poslať výsledok @${peerName} do chatu`}
          </Button.Label>
        </Button>
      )}
      {!!error && (
        <Txt className="text-danger text-[13px]" accessibilityRole="alert">
          {error}
        </Txt>
      )}
    </View>
  );
}

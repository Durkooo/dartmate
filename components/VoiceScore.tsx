import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button } from 'heroui-native';
import { Keyboard, Mic } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';
import { useVoiceScore, voiceSupported } from '@/lib/scoreInput';

/** Prepínač „Hlásiť hlasom“ / „Písať čísla“ a stav počúvania.
 *  Rozpoznané skóre sa ukáže v okne skóre a po 1,2 s zapíše (dá sa zrušiť).
 *  Pri zatvorení legu sa nezapíše samo — hráč vyberie počet šípok. */
export function VoiceScore({
  on,
  setOn,
  disabledReason,
  validate,
  needsDarts,
  onPreview,
  onCommit,
  onCancel,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  /** Prečo hlas teraz nejde (napr. beží mikrofón videohovoru). */
  disabledReason?: string;
  /** Chybová hláška pre neplatné skóre, alebo null. */
  validate: (n: number) => string | null;
  /** Skóre zatvára leg → treba vybrať počet šípok (nezapisuje sa samo). */
  needsDarts: (n: number) => boolean;
  onPreview: (n: number) => void;
  onCommit: (n: number) => void;
  onCancel: () => void;
}) {
  const supported = voiceSupported();
  const active = on && supported && !disabledReason;
  const [pending, setPending] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);
  const onScore = useCallback(
    (n: number) => {
      const err = validate(n);
      if (err) {
        setNote(`${n}: ${err}`);
        feedback.error();
        return;
      }
      setNote('');
      onPreview(n);
      feedback.selection();
      setPending(needsDarts(n) ? null : n);
      if (needsDarts(n)) setNote(`Zatváraš ${n} — vyber počet šípok nižšie.`);
    },
    [validate, needsDarts, onPreview],
  );
  const onUnclear = useCallback((heard: string) => {
    setNote(heard ? `Nerozumel som „${heard}“, zopakuj skóre.` : 'Nerozumel som, zopakuj.');
  }, []);
  const { listening, error, heard } = useVoiceScore(active, onScore, onUnclear);
  // Zápis po 1,2 s, ak ho hráč nezruší.
  useEffect(() => {
    if (pending === null) return undefined;
    const t = setTimeout(() => {
      commitRef.current(pending);
      setPending(null);
    }, 1200);
    return () => clearTimeout(t);
  }, [pending]);
  if (!supported) return null;
  return (
    <View className="mb-3 gap-2">
      <Button
        variant={on ? 'secondary' : 'tertiary'}
        className="rounded-xl"
        isDisabled={!!disabledReason && !on}
        onPress={() => {
          setOn(!on);
          setPending(null);
          setNote('');
          feedback.selection();
        }}
        accessibilityLabel={on ? 'Písať čísla' : 'Hlásiť hlasom'}
      >
        {on ? (
          <Keyboard size={20} color={palette.yellow} strokeWidth={1.8} />
        ) : (
          <Mic size={20} color={palette.ink} strokeWidth={1.8} />
        )}
        <Button.Label>{on ? 'Písať čísla' : 'Hlásiť hlasom'}</Button.Label>
      </Button>
      {on && (
        <View className="bg-surface gap-1 rounded-xl px-4 py-3">
          {disabledReason ? (
            <Txt className="text-muted text-[13px]">{disabledReason}</Txt>
          ) : error ? (
            <Txt className="text-danger text-[13px]">{error}</Txt>
          ) : pending !== null ? (
            <View className="flex-row items-center justify-between gap-3">
              <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Zapíšem {pending}…</Txt>
              <Button
                size="sm"
                variant="tertiary"
                onPress={() => {
                  setPending(null);
                  onCancel();
                  feedback.selection();
                }}
              >
                <Button.Label>Zrušiť</Button.Label>
              </Button>
            </View>
          ) : (
            <Txt className="text-[13px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
              {listening
                ? '🎤 Počúvam — povedz skóre, napr. „sto štyridsať“ alebo „šesťdesiat“'
                : 'Spúšťam mikrofón…'}
            </Txt>
          )}
          {!!heard && !disabledReason && (
            <Txt className="text-muted text-[12px]" numberOfLines={1}>
              Počul som: „{heard}“
            </Txt>
          )}
          {!!note && !disabledReason && <Txt className="text-muted text-[12px]">{note}</Txt>}
        </View>
      )}
    </View>
  );
}

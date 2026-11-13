import { View } from 'react-native';
import { Button } from 'heroui-native';
import { Delete, Undo2 } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';

type NumberPadProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Vrátenie posledného ťahu (šípka pri prázdnom vstupe). Bez neho šípka len maže vstup. */
  onUndoTurn?: () => void;
  disabled?: boolean;
  pending?: boolean;
  /** Hlasový režim: skryje číslice (ostane okno skóre, späť a Zapísať). */
  hideDigits?: boolean;
  /** id tlačidla „Zapísať“ (Enter z klávesnice ho stlačí). */
  submitId?: string;
};

export function NumberPad({
  value,
  onChange,
  onSubmit,
  onUndoTurn,
  disabled = false,
  pending = false,
  hideDigits = false,
  submitId,
}: NumberPadProps) {
  const locked = disabled || pending;
  const change = (next: string) => {
    onChange(next);
    feedback.selection();
  };
  const append = (digit: string) => {
    if (value.length >= 3) return;
    change(value === '0' ? digit : value + digit);
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Nahrané skóre</Txt>
        <Txt
          accessibilityLabel={`Skóre: ${value || '0'}`}
          accessibilityLiveRegion="polite"
          className={`text-[30px] leading-9 ${value ? '' : 'text-muted'}`}
          style={{ fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}
        >
          {value || '0'}
        </Txt>
      </View>
      {(hideDigits
        ? []
        : [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
          ]
      ).map((row) => (
        <View key={row.join('-')} className="flex-row gap-2">
          {row.map((digit) => (
            <Button
              key={digit}
              variant="secondary"
              className="bg-surface h-12 flex-1 rounded-xl"
              isDisabled={locked}
              onPress={() => append(String(digit))}
            >
              <Button.Label className="text-[21px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
                {digit}
              </Button.Label>
            </Button>
          ))}
        </View>
      ))}
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="h-12 flex-1 rounded-xl"
          accessibilityLabel={value ? 'Vymazať rozpísané skóre' : 'Vrátiť posledný ťah'}
          isDisabled={locked || (!value && !onUndoTurn)}
          onPress={() => (value ? change('') : onUndoTurn?.())}
        >
          <Undo2 size={21} color={palette.yellow} strokeWidth={1.8} />
        </Button>
        {!hideDigits && (
          <Button
            variant="secondary"
            className="bg-surface h-12 flex-1 rounded-xl"
            isDisabled={locked}
            onPress={() => append('0')}
          >
            <Button.Label className="text-[21px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
              0
            </Button.Label>
          </Button>
        )}
        <Button
          variant="secondary"
          className="h-12 flex-1 rounded-xl"
          accessibilityLabel="Vymazať poslednú číslicu"
          isDisabled={locked || !value}
          onPress={() => change(value.slice(0, -1))}
        >
          <Delete size={21} color={palette.yellow} strokeWidth={1.8} />
        </Button>
      </View>
      <Button className="mt-2" nativeID={submitId} isDisabled={locked || !value} onPress={onSubmit}>
        <Button.Label>{pending ? 'Ukladám…' : 'Zapísať skóre'}</Button.Label>
      </Button>
    </View>
  );
}

import { View } from 'react-native';
import { Button } from 'heroui-native';
import { Delete, Undo2 } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';

type NumberPadProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  pending?: boolean;
};

export function NumberPad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  pending = false,
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
      <View className="bg-surface mb-2 min-h-20 items-center justify-center rounded-xl p-4">
        <Txt
          accessibilityLabel={`Skóre: ${value || '0'}`}
          className="text-[36px]"
          style={{ fontFamily: 'Inter_700Bold' }}
        >
          {value || '0'}
        </Txt>
      </View>
      {[
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ].map((row) => (
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
          accessibilityLabel="Vymazať rozpísané skóre"
          isDisabled={locked || !value}
          onPress={() => change('')}
        >
          <Undo2 size={21} color={palette.ink} strokeWidth={1.8} />
        </Button>
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
        <Button
          variant="secondary"
          className="h-12 flex-1 rounded-xl"
          accessibilityLabel="Vymazať poslednú číslicu"
          isDisabled={locked || !value}
          onPress={() => change(value.slice(0, -1))}
        >
          <Delete size={21} color={palette.ink} strokeWidth={1.8} />
        </Button>
      </View>
      <Button className="mt-2" isDisabled={locked || !value} onPress={onSubmit}>
        <Button.Label>{pending ? 'Ukladám…' : 'Zapísať skóre'}</Button.Label>
      </Button>
    </View>
  );
}

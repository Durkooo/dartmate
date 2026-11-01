import { View } from 'react-native';
import { Button } from 'heroui-native';
import { Txt } from '@/components/DartsUI';
import { feedback } from '@/lib/darts';

export function CheckoutDarts({
  value,
  onChange,
  disabled = false,
}: {
  value: 1 | 2 | 3;
  onChange: (value: 1 | 2 | 3) => void;
  disabled?: boolean;
}) {
  return (
    <View className="gap-2">
      <Txt>Ktorou šípkou si zatvoril?</Txt>
      <View className="flex-row gap-2">
        {([1, 2, 3] as const).map((n) => (
          <Button
            key={n}
            variant={value === n ? 'primary' : 'secondary'}
            className="flex-1"
            isDisabled={disabled}
            accessibilityLabel={`Zatvorenie ${n}. šípkou`}
            accessibilityState={{ selected: value === n }}
            onPress={() => {
              if (value === n) return;
              onChange(n);
              feedback.selection();
            }}
          >
            <Button.Label numberOfLines={1}>{n}. šípka</Button.Label>
          </Button>
        ))}
      </View>
    </View>
  );
}

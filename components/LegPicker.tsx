import { useState } from 'react';
import { ScrollView, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Button, PressableFeedback } from 'heroui-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { feedback, palette } from '@/lib/darts';

const OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1);

function legsLabel(n: number): string {
  return n === 1 ? '1 leg' : n < 5 ? `${n} legy` : `${n} legov`;
}

/** Rolovacie okno na výber počtu víťazných legov (1–15). */
export function LegPicker({
  value,
  onChange,
  disabled = false,
  maxLegs = 15,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  maxLegs?: number;
}) {
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  const options = OPTIONS.filter((n) => n <= maxLegs);
  // Reserve the modal's 48px outer padding and 16px panel padding.
  const listHeight = Math.max(0, Math.min(options.length * 56, height * 0.7, height - 64));
  return (
    <>
      <Button
        variant="secondary"
        className="rounded-xl"
        isDisabled={disabled}
        accessibilityLabel={`Počet víťazných legov: ${legsLabel(value)}. Ťukni pre zmenu.`}
        onPress={() => setOpen(true)}
      >
        <Button.Label className="text-[20px]" style={{ fontFamily: 'Inter_700Bold' }}>
          {legsLabel(value)}
        </Button.Label>
        <ChevronDown size={20} color={palette.ink} strokeWidth={2} />
      </Button>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 items-center justify-center p-6">
          <Pressable
            className="absolute inset-0 bg-black/60"
            accessibilityLabel="Zavrieť výber legov"
            accessibilityRole="button"
            onPress={() => setOpen(false)}
          />
          <View
            className="bg-surface w-full max-w-[340px] rounded-2xl p-2"
            style={{ height: listHeight + 16, overflow: 'hidden' }}
          >
            <ScrollView
              style={{ height: listHeight, minHeight: 0, flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ flexGrow: 0, flexShrink: 0 }}
              nestedScrollEnabled
            >
              {options.map((n) => {
                const active = n === value;
                return (
                  <PressableFeedback
                    key={n}
                    className="flex-row items-center justify-between rounded-xl px-4 py-3"
                    accessibilityLabel={legsLabel(n)}
                    onPress={() => {
                      if (n !== value) {
                        onChange(n);
                        feedback.selection();
                      }
                      setOpen(false);
                    }}
                  >
                    <Txt
                      className="text-[18px]"
                      style={{ fontFamily: active ? 'Inter_700Bold' : 'Inter_400Regular' }}
                    >
                      {legsLabel(n)}
                    </Txt>
                    {active ? <Check size={20} color={palette.ink} strokeWidth={2.4} /> : null}
                  </PressableFeedback>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

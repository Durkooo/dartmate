import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from 'heroui-native';
import { Txt } from '@/components/DartsUI';
import { palette } from '@/lib/darts';

/* Spoločný vzhľad všetkých hier podľa zápasu 301/501: tmavá tabuľa so skóre,
 * žltý pásik „Na ťahu“ a klávesnica s tlačidlami ako pri zadávaní skóre. */

export function ScoreBoard({
  top,
  players,
  active,
  bottom,
  bottomLeft,
  bottomRight,
}: {
  /** Malý text hore (kolo, stav). */
  top: string;
  players: { name: string; value: string; sub?: string }[];
  /** Index hráča na ťahu (zvýraznený žltou), null = nikto. */
  active: number | null;
  /** Žltý pásik dole (stred). */
  bottom: string;
  /** Ľavý / pravý roh žltého pásika (napr. vyhrané legy hráčov). */
  bottomLeft?: string;
  bottomRight?: string;
}) {
  return (
    <View className="bg-ink mb-3 overflow-hidden rounded-[22px]">
      <View className="flex-row items-center justify-center gap-2 pt-1.5">
        <View className="bg-accent h-1.5 w-1.5 rounded-full" />
        <Txt className="text-on-ink text-[13px]">{top}</Txt>
      </View>
      <View className="flex-row px-3 py-1">
        {players.map((p, i) => (
          <View
            key={`${p.name}-${String(i)}`}
            className={`flex-1 items-center px-2 ${i < players.length - 1 ? 'border-on-ink/20 border-r' : ''}`}
          >
            <Txt className="text-on-ink text-[14px]" numberOfLines={1}>
              {p.name}
            </Txt>
            <Txt
              className={`text-[57px] leading-[68px] ${active === i ? 'text-accent' : 'text-white'}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                fontFamily: 'Inter_700Bold',
                fontVariant: ['tabular-nums'],
                letterSpacing: -2,
              }}
              maxFontSizeMultiplier={1.15}
            >
              {p.value}
            </Txt>
            {!!p.sub && <Txt className="text-on-ink text-[12px]">{p.sub}</Txt>}
          </View>
        ))}
      </View>
      <ScoreStrip left={bottomLeft} center={bottom} right={bottomRight} />
    </View>
  );
}

/** Žltý pásik tabule: stred + rohy (legy). Text je vždy tmavomodrý (aj v tmavom režime). */
export function ScoreStrip({
  left,
  center,
  right,
}: {
  left?: string;
  center: string;
  right?: string;
}) {
  const side = { fontFamily: 'Inter_700Bold', color: palette.navy, minWidth: 64 } as const;
  return (
    <View className="bg-accent flex-row items-center px-4 py-1.5">
      {left !== undefined || right !== undefined ? (
        <Txt className="text-[14px]" style={side} numberOfLines={1}>
          {left ?? ''}
        </Txt>
      ) : null}
      <Txt
        className="flex-1 text-center text-[14px]"
        style={{ fontFamily: 'Inter_600SemiBold', color: palette.navy }}
        numberOfLines={1}
      >
        {center}
      </Txt>
      {left !== undefined || right !== undefined ? (
        <Txt className="text-right text-[14px]" style={side} numberOfLines={1}>
          {right ?? ''}
        </Txt>
      ) : null}
    </View>
  );
}

/** Tlačidlo klávesnice (rovnaké ako číslice pri zadávaní skóre). */
export function PadButton({
  label,
  onPress,
  selected = false,
  toggle = false,
  disabled = false,
  accessibilityLabel,
  children,
}: {
  label?: string;
  onPress: () => void;
  selected?: boolean;
  /** Výber z možností: aktívna voľba tmavomodrá, ostatné biele. */
  toggle?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  return (
    <Button
      variant={toggle ? (selected ? 'secondary' : 'tertiary') : selected ? 'primary' : 'secondary'}
      className="h-12 flex-1 rounded-xl"
      isDisabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
    >
      {children}
      {!!label && (
        <Button.Label className="text-[21px]" style={{ fontFamily: 'Inter_600SemiBold' }}>
          {label}
        </Button.Label>
      )}
    </Button>
  );
}

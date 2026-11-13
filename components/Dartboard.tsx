import Svg, { Circle, Path, G, Line, Text as SvgText } from 'react-native-svg';
import { palette } from '@/lib/darts';

const numbers = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const point = (radius: number, angle: number) => ({
  x: 120 + radius * Math.sin(angle),
  y: 120 - radius * Math.cos(angle),
});
function sector(inner: number, outer: number, a: number, b: number) {
  const p1 = point(outer, a),
    p2 = point(outer, b),
    p3 = point(inner, b),
    p4 = point(inner, a);
  return `M ${p1.x} ${p1.y} A ${outer} ${outer} 0 0 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${inner} ${inner} 0 0 0 ${p4.x} ${p4.y} Z`;
}
/** Farby terča: klasické, alebo „tabuľa“ = farby skóre boxu zo zápasu
 *  (tmavomodrá, žltá, svetlomodrošedá). */
const TONES = {
  classic: {
    base: palette.ink,
    edge: palette.onInk,
    light: palette.paper,
    dark: palette.ink,
    ringA: palette.yellow,
    ringB: palette.blue,
    line: palette.onInk,
    ringLine: palette.ink,
    label: palette.onInk,
    bull: palette.blue,
    eye: palette.yellow,
  },
  board: {
    base: palette.ink,
    edge: 'rgba(189,200,219,0.35)',
    light: '#2B3C5C',
    dark: palette.ink,
    ringA: palette.yellow,
    ringB: 'rgba(189,200,219,0.55)',
    line: 'rgba(189,200,219,0.22)',
    ringLine: palette.ink,
    label: 'rgba(189,200,219,0.75)',
    bull: 'rgba(189,200,219,0.55)',
    eye: palette.yellow,
  },
} as const;

export function Dartboard({
  size = 190,
  dart = true,
  tone = 'classic',
}: {
  size?: number;
  dart?: boolean;
  tone?: keyof typeof TONES;
}) {
  const c = TONES[tone];
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240" accessibilityLabel="Šípkový terč">
      <Circle cx="120" cy="120" r="119" fill={c.base} stroke={c.edge} strokeWidth="1" />
      <G>
        {numbers.map((n, i) => {
          const a = ((i * 18 - 9) * Math.PI) / 180,
            b = ((i * 18 + 9) * Math.PI) / 180;
          const label = point(108, (i * 18 * Math.PI) / 180);
          return (
            <G key={n}>
              <Path
                d={sector(12, 96, a, b)}
                fill={i % 2 === 0 ? c.light : c.dark}
                stroke={c.line}
                strokeWidth="0.5"
              />
              <Path
                d={sector(89, 96, a, b)}
                fill={i % 2 === 0 ? c.ringA : c.ringB}
                stroke={c.ringLine}
                strokeWidth="0.5"
              />
              <Path
                d={sector(53, 60, a, b)}
                fill={i % 2 === 0 ? c.ringA : c.ringB}
                stroke={c.ringLine}
                strokeWidth="0.5"
              />
              <SvgText
                x={label.x}
                y={label.y + 4}
                textAnchor="middle"
                fill={c.label}
                fontSize="11"
                fontFamily="Inter_500Medium"
              >
                {n}
              </SvgText>
            </G>
          );
        })}
      </G>
      <Circle cx="120" cy="120" r="12" fill={c.bull} stroke={c.ringLine} />
      <Circle cx="120" cy="120" r="5" fill={c.eye} />
      {dart ? (
        <>
          <Line x1="142" y1="92" x2="192" y2="39" stroke={palette.yellow} strokeWidth="3" />
          <Path
            d="M 179 52 L 179 31 L 204 22 L 200 46 Z"
            fill={palette.yellow}
            stroke={palette.ink}
            strokeWidth="2"
          />
        </>
      ) : null}
    </Svg>
  );
}

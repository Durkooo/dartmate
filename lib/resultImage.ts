import { Platform } from 'react-native';
import { palette as livePalette } from '@/lib/darts';

/** Obrázok výsledku má vždy svetlé farby (rovnaký v svetlom aj tmavom režime). */
const palette = {
  ...livePalette,
  ink: livePalette.navy,
  paper: '#D2D7E0',
  white: '#FFFFFF',
  muted: '#5B6679',
};

/* Výsledok zápasu ako obrázok (tabuľka so štatistikami), ktorý sa pošle do chatu
 * ako fotka — príjemca si ho zväčší a stiahne. Kreslí sa na webe cez <canvas>;
 * natívne (alebo pri chybe) sa pošle len textová karta. */

/** Jeden hod (3 šípky) pre výpočet štatistík x01. */
export type StatVisit = {
  /** Body hodu (pokazený hod = 0). */
  points: number;
  darts: number;
  /** Zostatok po hode (0 = zatvorené). */
  remaining: number;
  bust: boolean;
  leg: number | string;
};
export type X01Stats = {
  avg3: number | null;
  avg9: number | null;
  tons100: number;
  tons140: number;
  count180: number;
  bestLeg: number | null;
  highestCheckout: number | null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Štatistiky jedného hráča zo zoznamu jeho hodov (v poradí). */
export function x01Stats(visits: StatVisit[]): X01Stats {
  let points = 0;
  let darts = 0;
  let f9Points = 0;
  let f9Darts = 0;
  const legDarts = new Map<number | string, number>();
  let tons100 = 0;
  let tons140 = 0;
  let count180 = 0;
  let bestLeg: number | null = null;
  let highestCheckout: number | null = null;
  for (const v of visits) {
    const p = v.bust ? 0 : v.points;
    const d = v.darts || 3;
    points += p;
    darts += d;
    const used = legDarts.get(v.leg) ?? 0;
    if (used < 9) {
      const take = Math.min(d, 9 - used);
      f9Points += (p * take) / d;
      f9Darts += take;
    }
    legDarts.set(v.leg, used + d);
    if (p >= 100) tons100 += 1;
    if (p >= 140) tons140 += 1;
    if (p === 180) count180 += 1;
    if (!v.bust && v.remaining === 0) {
      bestLeg = bestLeg === null ? used + d : Math.min(bestLeg, used + d);
      highestCheckout = Math.max(highestCheckout ?? 0, p);
    }
  }
  return {
    avg3: darts ? round1((points * 3) / darts) : null,
    avg9: f9Darts ? round1((f9Points * 3) / f9Darts) : null,
    tons100,
    tons140,
    count180,
    bestLeg,
    highestCheckout,
  };
}

const n = (v: number | null) => (v === null ? '–' : String(v));
const a = (v: number | null) => (v === null ? '–' : v.toFixed(1));

/** Hody jedného hráča z online zápasu (v poradí) pre x01Stats. */
export function onlineVisits(
  turns: {
    player_id: string;
    turn_number: number;
    score: number;
    darts: number;
    remaining: number;
    bust: boolean;
    leg_number: number;
  }[],
  playerId: string,
): StatVisit[] {
  return turns
    .filter((t) => t.player_id === playerId)
    .sort((x, y) => x.turn_number - y.turn_number)
    .map((t) => ({
      points: t.score,
      darts: t.darts,
      remaining: t.remaining,
      bust: t.bust,
      leg: t.leg_number,
    }));
}

/** Riadky tabuľky x01 pre obrázok (jeden stĺpec na hráča). */
export function x01Rows(stats: X01Stats[]): { label: string; values: string[] }[] {
  return [
    { label: 'Priemer na 3 šípky', values: stats.map((s) => a(s.avg3)) },
    { label: 'Priemer prvých 9 šípok', values: stats.map((s) => a(s.avg9)) },
    { label: '100+', values: stats.map((s) => String(s.tons100)) },
    { label: '140+', values: stats.map((s) => String(s.tons140)) },
    { label: '180', values: stats.map((s) => String(s.count180)) },
    { label: 'Najlepší leg (šípky)', values: stats.map((s) => n(s.bestLeg)) },
    { label: 'Najvyššie zatvorenie', values: stats.map((s) => n(s.highestCheckout)) },
  ];
}

export type ResultImage = {
  /** Napr. „501 · double out · na 2 legy“. */
  subtitle: string;
  players: { name: string; score: string }[];
  /** Index víťaza (žltý), null = nikto / sólo. */
  winner: number | null;
  rows: { label: string; values: string[] }[];
};

const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

/** Nakreslí tabuľku do PNG. null = nedá sa (natívne / bez canvasu). */
export async function renderResultImage(r: ResultImage): Promise<Blob | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  try {
    await document.fonts?.ready;
    const W = 1080;
    const pad = 56;
    const headerH = 420;
    const rowH = 92;
    const H = headerH + 40 + r.rows.length * rowH + 120;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Pozadie
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, W, H);
    // Tmavá tabuľa so skóre (ako v zápase)
    const boardX = pad;
    const boardW = W - pad * 2;
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.roundRect(boardX, pad, boardW, headerH - pad, 44);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = palette.onInk;
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(`🎯 DartMate · ${r.subtitle}`, W / 2, pad + 64);
    const cols = r.players.length;
    const colW = boardW / cols;
    r.players.forEach((p, i) => {
      const cx = boardX + colW * i + colW / 2;
      ctx.fillStyle = palette.onInk;
      ctx.font = `600 38px ${FONT}`;
      ctx.fillText(p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name, cx, pad + 140);
      ctx.fillStyle = r.winner === i ? palette.yellow : palette.white;
      ctx.font = `700 150px ${FONT}`;
      ctx.fillText(p.score, cx, pad + 290);
      if (i > 0) {
        ctx.strokeStyle = 'rgba(189,200,219,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(boardX + colW * i, pad + 100);
        ctx.lineTo(boardX + colW * i, pad + 320);
        ctx.stroke();
      }
    });
    // Tabuľka štatistík
    const labelW = cols > 1 ? 430 : 600;
    const valueW = (boardW - labelW) / cols;
    let y = headerH + 40;
    r.rows.forEach((row, ri) => {
      if (ri % 2 === 0) {
        ctx.fillStyle = palette.white;
        ctx.beginPath();
        ctx.roundRect(boardX, y, boardW, rowH, 20);
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = palette.muted;
      ctx.font = `500 36px ${FONT}`;
      ctx.fillText(row.label, boardX + 28, y + rowH / 2 + 13);
      ctx.textAlign = 'center';
      ctx.fillStyle = palette.ink;
      ctx.font = `700 42px ${FONT}`;
      row.values.forEach((v, vi) => {
        ctx.fillText(v, boardX + labelW + valueW * vi + valueW / 2, y + rowH / 2 + 15);
      });
      y += rowH;
    });
    // Pätička
    ctx.textAlign = 'center';
    ctx.fillStyle = palette.muted;
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(new Date().toLocaleDateString('sk-SK'), W / 2, H - 50);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  }
}

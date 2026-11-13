import * as Crypto from 'expo-crypto';
import { bilt } from '@/lib/bilt';
import { notifyRecipient } from '@/lib/sendPush';
import { MESSAGE_PHOTOS_BUCKET } from '@/lib/messagePhotos';

/** Výsledok zápasu poslaný do chatu je obyčajná čitateľná správa s touto hlavičkou
 *  (v upozornení aj v staršej verzii appky sa ukáže ako text, appka z nej spraví kartu). */
export const RESULT_HEADER = '🎯 Výsledok zápasu';

export function isResultMessage(body: string | null | undefined): boolean {
  return !!body && body.startsWith(`${RESULT_HEADER}\n`);
}

const avg = (n: number | null) => (n === null ? '–' : n.toFixed(1));

/** Súper ako text na karte: hráč z appky s @, bot / dočasný súper bez neho. */
const who = (name: string, tagged: boolean) => (tagged ? `@${name}` : name);

/** Sólo hra (hráč sám) 301/501. */
export function formatSoloResult(r: {
  me: string;
  starting: number;
  doubleOut: boolean;
  legs: number;
  darts: number;
  avg: number | null;
}): string {
  return [
    RESULT_HEADER,
    `@${r.me} · sólo ${r.starting}`,
    `${r.legs > 1 ? `${r.legs} legy` : 'Dohrané'} za ${r.darts} šípok${r.doubleOut ? ' · double out' : ''}`,
    `Priemer ${avg(r.avg)}`,
  ].join('\n');
}

/** Tréning: hlavný výsledok a pár štatistík (karta v chate). */
export function formatTrainingResult(r: {
  me: string;
  title: string;
  result: string;
  stats: { label: string; value: string }[];
}): string {
  return [
    RESULT_HEADER,
    `@${r.me} · tréning ${r.title}`,
    r.result,
    ...r.stats.slice(0, 4).map((st) => `${st.label}: ${st.value}`),
  ].join('\n');
}

/** Cricket: body a šípky oboch hráčov. */
export function formatCricketResult(r: {
  me: string;
  opponent: string;
  opponentTagged: boolean;
  points: [number, number];
  darts: [number, number];
  won: boolean;
}): string {
  const opp = who(r.opponent, r.opponentTagged);
  return [
    RESULT_HEADER,
    `@${r.me} ${r.points[0]} : ${r.points[1]} ${opp}`,
    `Cricket · vyhral ${r.won ? `@${r.me}` : opp}`,
    `Šípky ${r.darts[0]} : ${r.darts[1]}`,
  ].join('\n');
}

export function formatResult(r: {
  me: string;
  opponent: string;
  /** false = bot alebo dočasný súper (bez @). */
  opponentTagged?: boolean;
  /** Legy (alebo 1:0 pri jednom legu) [ja, súper]. */
  score: [number, number];
  won: boolean;
  starting: number;
  doubleOut: boolean;
  avg: [number | null, number | null];
}): string {
  const opp = who(r.opponent, r.opponentTagged ?? true);
  return [
    RESULT_HEADER,
    `@${r.me} ${r.score[0]} : ${r.score[1]} ${opp}`,
    `${r.starting}${r.doubleOut ? ' · double out' : ''} · vyhral ${r.won ? `@${r.me}` : opp}`,
    `Priemer ${avg(r.avg[0])} : ${avg(r.avg[1])}`,
  ].join('\n');
}

/** Riadky karty (bez hlavičky). */
export function resultLines(body: string): string[] {
  return body.split('\n').slice(1).filter(Boolean);
}

/** Pošle výsledok priateľovi do chatu (+ upozornenie). S obrázkom tabuľky ho
 *  pošle ako fotku (príjemca si ju zväčší a stiahne); bez neho len text. */
export async function sendResult(
  peerId: string,
  myNick: string,
  body: string,
  image?: () => Promise<Blob | null>,
): Promise<void> {
  const myId: string | undefined = (await bilt.auth.getSession()).data?.session?.user.id;
  let photoPath: string | null = null;
  if (image && myId) {
    try {
      const blob = await image();
      if (blob) {
        const path = `${myId}/${peerId}/${Crypto.randomUUID()}.png`;
        const { error } = await bilt.storage
          .from(MESSAGE_PHOTOS_BUCKET)
          .upload(path, blob, { contentType: 'image/png', upsert: false });
        if (!error) photoPath = path;
      }
    } catch {
      // Obrázok sa nepodaril — pošle sa aspoň textová karta.
    }
  }
  const { data, error } = photoPath
    ? await bilt.rpc('send_image_message', {
        peer: peerId,
        message_body: body,
        client_request: Crypto.randomUUID(),
        photo_path: photoPath,
      })
    : await bilt.rpc('send_direct_message', {
        peer: peerId,
        message_body: body,
        client_request: Crypto.randomUUID(),
      });
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new Error('Výsledok sa nepodarilo poslať.');
  // Odkaz z pohľadu príjemcu = konverzácia so mnou.
  if (myId)
    notifyRecipient(
      peerId,
      `@${myNick}`,
      resultLines(body)[0] ?? RESULT_HEADER,
      `/conversation/${myId}`,
    );
}

import * as Crypto from 'expo-crypto';
import { bilt } from '@/lib/bilt';
import { notifyRecipient } from '@/lib/sendPush';

/** Výsledok zápasu poslaný do chatu je obyčajná čitateľná správa s touto hlavičkou
 *  (v upozornení aj v staršej verzii appky sa ukáže ako text, appka z nej spraví kartu). */
export const RESULT_HEADER = '🎯 Výsledok zápasu';

export function isResultMessage(body: string | null | undefined): boolean {
  return !!body && body.startsWith(`${RESULT_HEADER}\n`);
}

const avg = (n: number | null) => (n === null ? '–' : n.toFixed(1));

export function formatResult(r: {
  me: string;
  opponent: string;
  /** Legy (alebo 1:0 pri jednom legu) [ja, súper]. */
  score: [number, number];
  won: boolean;
  starting: number;
  doubleOut: boolean;
  avg: [number | null, number | null];
}): string {
  return [
    RESULT_HEADER,
    `@${r.me} ${r.score[0]} : ${r.score[1]} @${r.opponent}`,
    `${r.starting}${r.doubleOut ? ' · double out' : ''} · vyhral @${r.won ? r.me : r.opponent}`,
    `Priemer ${avg(r.avg[0])} : ${avg(r.avg[1])}`,
  ].join('\n');
}

/** Riadky karty (bez hlavičky). */
export function resultLines(body: string): string[] {
  return body.split('\n').slice(1).filter(Boolean);
}

/** Pošle výsledok priateľovi do chatu (+ upozornenie). */
export async function sendResult(peerId: string, myNick: string, body: string): Promise<void> {
  const { data, error } = await bilt.rpc('send_direct_message', {
    peer: peerId,
    message_body: body,
    client_request: Crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new Error('Výsledok sa nepodarilo poslať.');
  const myId: string | undefined = (await bilt.auth.getSession()).data?.session?.user.id;
  // Odkaz z pohľadu príjemcu = konverzácia so mnou.
  if (myId)
    notifyRecipient(
      peerId,
      `@${myNick}`,
      resultLines(body)[0] ?? RESULT_HEADER,
      `/conversation/${myId}`,
    );
}

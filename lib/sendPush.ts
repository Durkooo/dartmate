import { bilt } from './bilt';

const BILT_URL = process.env.EXPO_PUBLIC_BILT_URL ?? '';
const BILT_ANON = process.env.EXPO_PUBLIC_BILT_ANON_KEY ?? '';

/**
 * Po úspešnom odoslaní správy požiada backend (edge funkcia `send-push`),
 * aby príjemcovi poslal Web Push notifikáciu. Fire-and-forget: chyba push
 * nesmie ovplyvniť odoslanú správu, preto sa volá bez čakania a potichu.
 *
 * Voláme priamy fetch na /functions/v1 (nie bilt.functions), aby hovor
 * fungoval aj keby wrapper klienta funkcie nevystavoval.
 */
export function notifyRecipient(
  recipientId: string,
  title: string,
  body: string,
  url: string,
): void {
  void (async () => {
    try {
      if (!BILT_URL || !BILT_ANON) return;
      const session = await bilt.auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) return;
      const snippet = body.length > 80 ? `${body.slice(0, 80)}…` : body;
      await fetch(`${BILT_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          apikey: BILT_ANON,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: recipientId, title, body: snippet, url }),
      });
    } catch {
      /* Push je bonus — správa už odišla. */
    }
  })();
}

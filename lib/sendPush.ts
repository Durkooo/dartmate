import { bilt } from './bilt';

/**
 * Po úspešnom odoslaní správy požiada backend (edge funkcia `send-push`),
 * aby príjemcovi poslal Web Push notifikáciu. Fire-and-forget: chyba push
 * nesmie ovplyvniť odoslanú správu, preto sa volá bez čakania a potichu.
 */
export function notifyRecipient(
  recipientId: string,
  title: string,
  body: string,
  url: string,
): void {
  try {
    const invoke = bilt?.functions?.invoke?.bind(bilt.functions);
    if (!invoke) return;
    const snippet = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    void Promise.resolve(
      invoke('send-push', { body: { user_id: recipientId, title, body: snippet, url } }),
    ).catch(() => {
      /* Push je bonus — správa už odišla. */
    });
  } catch {
    /* Nikdy nerozbíjaj odosielanie správ. */
  }
}

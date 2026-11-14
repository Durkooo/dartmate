import { bilt } from './bilt';

/** Request a push after saving a message; push failure must not undo the message. */
export function notifyRecipient(
  recipientId: string,
  title: string,
  body: string,
  url: string,
): void {
  void (async () => {
    try {
      const snippet = body.length > 80 ? `${body.slice(0, 80)}…` : body;
      const { data, error } = await bilt.functions.invoke('send-push', {
        body: { user_id: recipientId, title, body: snippet, url },
      });
      if (error) {
        console.warn('Push request failed:', error.message);
        return;
      }
      if (data?.attempted === 0 && !data?.skipped_in_match)
        console.warn('Push recipient has no registered device.');
    } catch (error) {
      console.warn('Push request failed:', error instanceof Error ? error.message : String(error));
    }
  })();
}

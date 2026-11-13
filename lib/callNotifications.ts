import { Platform } from 'react-native';

/** Zavrie systémové upozornenie o hovore od priateľa (napr. po prijatí v appke),
 *  aby na Androide ďalej nevisela zvoniaca notifikácia. Chyba nevadí. */
export function closeCallNotifications(peerId: string): void {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  void (async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      const list = await reg.getNotifications({ tag: `dartmate-call-/conversation/${peerId}` });
      for (const n of list) n.close();
    } catch {
      // Upozornenie ostane — nič vážne.
    }
  })();
}

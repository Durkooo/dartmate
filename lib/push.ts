import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bilt, isBiltConfigured } from '@/lib/bilt';

/**
 * Web Push notifikácie o nových správach (PWA).
 *
 * Ako to funguje:
 * 1. Používateľ povolí notifikácie (Notification.requestPermission).
 * 2. Prehliadač vytvorí push subscription (endpoint + kľúče).
 * 3. Subscription uložíme do tabuľky push_subscriptions (user_id, endpoint, keys).
 * 4. Backend po vložení novej správy pošle Web Push na endpoint príjemcu.
 * 5. Service Worker (sw.js) notifikáciu zobrazí, aj keď je appka zavretá.
 *
 * iOS: funguje len ak je appka pridaná na plochu (Add to Home Screen), iOS 16.4+.
 */

const ASKED_KEY = 'push-permission-asked';
const SUB_SENT_KEY = 'push-sub-saved:';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = globalThis.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

/** VAPID public key je verejný – je v build-e, netreba ho tajiť. */
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export async function ensurePushSubscription(userId: string): Promise<'ok' | 'denied' | 'skipped' | 'error'> {
  if (!pushSupported() || !isBiltConfigured || !VAPID_PUBLIC_KEY) return 'skipped';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint) return 'error';
    const cacheKey = SUB_SENT_KEY + userId + ':' + json.endpoint.slice(-32);
    if (await AsyncStorage.getItem(cacheKey)) return 'ok';
    const { error } = await bilt.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      },
      { onConflict: 'endpoint' },
    );
    if (error) return 'error';
    await AsyncStorage.setItem(cacheKey, '1');
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function requestPushPermission(userId: string): Promise<'ok' | 'denied' | 'skipped' | 'error'> {
  if (!pushSupported()) return 'skipped';
  if (Notification.permission === 'granted') return ensurePushSubscription(userId);
  if (Notification.permission === 'denied') return 'denied';
  try {
    await AsyncStorage.setItem(ASKED_KEY, '1');
    const result = await Notification.requestPermission();
    if (result !== 'granted') return 'denied';
    return ensurePushSubscription(userId);
  } catch {
    return 'error';
  }
}

export async function wasPushAsked(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ASKED_KEY)) === '1';
  } catch {
    return true;
  }
}

/** iPhone bez nainštalovanej PWA: Web Push tam Apple nedovolí. */
export function needsIosInstall(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (!ios) return false;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches);
  return !standalone;
}

/** Android web bez podpory Web Push (starý/WebView prehliadač) – treba Chrome. */
export function needsAndroidChrome(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua)) return false;
  return !pushSupported();
}

/** Krátka platforma-špecifická veta do výzvy. */
export function pushHintLine(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua))
    return ' Na iPhone funguje len ak máš appku pridanú na plochu.';
  if (/Android/i.test(ua))
    return ' Na Androide stačí Chrome (aj bez inštalácie), najlepšie s appkou na ploche.';
  return '';
}

/**
 * Vypne upozornenia: zruší subscription v prehliadači a zmaže ho z DB,
 * aby backend nemal kam posielať.
 */
export async function disablePushSubscription(userId: string): Promise<'ok' | 'error'> {
  try {
    if (pushSupported()) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub?.endpoint) {
        await bilt.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
    }
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(SUB_SENT_KEY + userId + ':'));
    if (mine.length) await AsyncStorage.multiRemove(mine);
    return 'ok';
  } catch {
    return 'error';
  }
}

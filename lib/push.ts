import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bilt, biltConfigured } from '@/lib/bilt';
import { swRegisterError } from '@/lib/registerServiceWorker';

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

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
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

/** Verzia iOS z user-agenta (napr. 17.2), alebo null ak sa nedá zistiť. */
export function iosVersion(): number | null {
  if (typeof navigator === 'undefined') return null;
  const m = navigator.userAgent.match(/OS (\d+)[_.](\d+)/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 100;
}

/** Beží appka z ikony na ploche (standalone), alebo v prehliadači? */
export function standaloneMode(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/** Dôvod, prečo push nejde — rozlíši prehliadač, iOS verziu a konfiguráciu. */
export function pushBlockReason(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'Len vo webovej verzii.';
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const v = isIOS ? iosVersion() : null;
  const where = isIOS
    ? `iOS ${v !== null ? String(v).replace('.', ',') : '?'}, ${standaloneMode() ? 'appka z plochy' : 'otvorené v Safari'}`
    : standaloneMode()
      ? 'web, appka z plochy'
      : 'web, prehliadač';
  if (isIOS && v !== null && v < 16.4)
    return `Starý ${where} — Web Push vyžaduje aspoň iOS 16.4 (Nastavenia → Všeobecné → Aktualizácia softvéru).`;
  const missing: string[] = [];
  if (!('serviceWorker' in navigator)) missing.push('serviceWorker');
  if (!('PushManager' in window)) missing.push('PushManager');
  if (!('Notification' in window)) missing.push('Notification');
  if (missing.length)
    return `Chýba: ${missing.join(', ')} (${where}). Ak máš appku na ploche a nové iOS, skús ju z plochy zmazať a pridať znova zo Safari (Zdieľať → Pridať na plochu).`;
  if (!biltConfigured) return 'Chýba konfigurácia online služieb.';
  if (!VAPID_PUBLIC_KEY) return 'Chýba VAPID kľúč v builde — napíš vývojárovi.';
  return null;
}

/** Výsledok s ľudsky čitateľným dôvodom (zobrazí sa používateľovi pri zlyhaní). */
export type PushResult = { ok: boolean; reason?: string };

function errText(e: unknown): string {
  return e instanceof Error ? (e.message || e.name) : String(e);
}

/** VAPID public key je verejný – je v build-e, netreba ho tajiť. */
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** Čakanie s limitom — serviceWorker.ready vie visieť naveky, ak SW zlyhal. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Stav registrácie Service Workera — nevisí (na rozdiel od .ready). */
export async function swStatus(): Promise<{ registered: boolean; active: boolean; state: string }> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator))
    return { registered: false, active: false, state: 'no-sw-api' };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { registered: false, active: false, state: 'none' };
    const sw = reg.active ?? reg.waiting ?? reg.installing;
    return { registered: true, active: !!reg.active, state: sw?.state ?? 'unknown' };
  } catch {
    return { registered: false, active: false, state: 'error' };
  }
}

export async function ensurePushSubscription(userId: string): Promise<PushResult> {
  const blocked = pushBlockReason();
  if (blocked) return { ok: false, reason: blocked };
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  try {
    const reg = await withTimeout(
      navigator.serviceWorker.ready,
      10000,
      'Service Worker sa neaktivoval do 10 s — skús appku úplne zavrieť a otvoriť znova.',
    );
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      } catch (e) {
        return { ok: false, reason: `Prehliadač odmietol registráciu (1): ${errText(e)}` };
      }
    }
    const json = sub.toJSON();
    if (!json.endpoint) return { ok: false, reason: 'Prehliadač nevrátil endpoint (2).' };
    const cacheKey = SUB_SENT_KEY + userId + ':' + json.endpoint.slice(-32);
    if (await AsyncStorage.getItem(cacheKey)) return { ok: true };
    const { error } = await bilt.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      },
      { onConflict: 'endpoint' },
    );
    if (error) return { ok: false, reason: `Uloženie do databázy zlyhalo (3): ${error.message}` };
    await AsyncStorage.setItem(cacheKey, '1');
    return { ok: true };
  } catch (e) {
    let extra = '';
    try {
      const st = await swStatus();
      const regErr = swRegisterError();
      extra = ` [SW: ${st.state}${regErr ? `; reg: ${regErr}` : ''}]`;
    } catch {
      /* stav SW nezistíme */
    }
    return { ok: false, reason: `Neočakávaná chyba (4): ${errText(e)}${extra}` };
  }
}

export async function requestPushPermission(userId: string): Promise<PushResult> {
  const blocked = pushBlockReason();
  if (blocked) return { ok: false, reason: blocked };
  if (Notification.permission === 'granted') return ensurePushSubscription(userId);
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  try {
    await AsyncStorage.setItem(ASKED_KEY, '1');
    const result = await Notification.requestPermission();
    if (result !== 'granted') return { ok: false, reason: 'denied' };
    return ensurePushSubscription(userId);
  } catch (e) {
    return { ok: false, reason: `Povolenie zlyhalo (5): ${errText(e)}` };
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
export async function disablePushSubscription(userId: string): Promise<PushResult> {
  try {
    if (pushSupported()) {
      const reg = await withTimeout(navigator.serviceWorker.ready, 10000, 'Service Worker timeout.');
      const sub = await reg.pushManager.getSubscription();
      if (sub?.endpoint) {
        await bilt.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
    }
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(SUB_SENT_KEY + userId + ':'));
    if (mine.length) await AsyncStorage.multiRemove(mine);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: errText(e) };
  }
}

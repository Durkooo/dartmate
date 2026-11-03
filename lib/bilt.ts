import { createClient, asyncStorage } from '@biltme/backend';
import AsyncStorage from '@react-native-async-storage/async-storage';

const url = process.env.EXPO_PUBLIC_BILT_URL;
const key = process.env.EXPO_PUBLIC_BILT_ANON_KEY;

export const biltConfigured = Boolean(url && key);

const MISSING_MSG =
  'Online služby nie sú nastavené. Nastav EXPO_PUBLIC_BILT_URL a EXPO_PUBLIC_BILT_ANON_KEY vo Verceli.';

// Náhradný klient: appka nespadne, online volania vrátia zrozumiteľnú chybu
function makeStub(): any {
  const result = {
    data: { session: null, user: null, subscription: { unsubscribe() {} } },
    error: { message: MISSING_MSG },
  };
  const promise = () => Promise.resolve(result);
  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (prop === 'then') return (a?: any, b?: any) => promise().then(a, b);
      if (prop === 'catch') return (b?: any) => promise().catch(b);
      if (prop === 'finally') return (f?: any) => promise().finally(f);
      if (prop === 'data') return result.data;
      if (prop === 'error') return result.error;
      if (prop === 'unsubscribe') return () => {};
      return stub;
    },
    apply() {
      return stub;
    },
  };
  const stub: any = new Proxy(function () {}, handler);
  return stub;
}

if (!biltConfigured) {
  console.warn(MISSING_MSG);
}

export const bilt: any = biltConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: asyncStorage(AsyncStorage),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : makeStub();

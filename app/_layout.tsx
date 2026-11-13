// oxlint-disable-next-line eslint-plugin-import/no-unassigned-import
import '../global.css';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import * as DevClient from 'expo-dev-client';
import { HeroUINativeProvider } from 'heroui-native';
import { Uniwind } from 'uniwind';
import { applyTheme } from '@/lib/theme';
import { useAutoBackup } from '@/lib/backup';
import {
  ErrorBoundary as ExpoErrorBoundary,
  type ErrorBoundaryProps,
  SplashScreen,
  Stack,
} from 'expo-router';

import { patchExpoGoAssetUrls } from '@/lib/expoGoAssets';
import { registerColorTokens } from '@/lib/registerColorTokens';
import { initPostHog } from '@/lib/posthog';
import { registerServiceWorker } from '@/lib/registerServiceWorker';
import { reportErrorToParent } from '@/lib/reportPreviewError';
import { InstallPrompt } from '@/components/InstallPrompt';
import { IncomingCallWatcher } from '@/components/IncomingCall';
import { palette } from '@/lib/darts';
import { usePlayerSession, usePlayers } from '@/lib/players';
import { useOnlinePresence } from '@/lib/online';
import { ensurePushSubscription, pushSupported } from '@/lib/push';

/**
 * Custom ErrorBoundary that reports React render errors to the parent window (Bilt preview iframe)
 * and then renders the default Expo error UI.
 */
function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    if (Platform.OS === 'web' && error) {
      const message = [error.message, error.stack].filter(Boolean).join('\n');
      reportErrorToParent(message);
    }
  }, [error]);
  return <ExpoErrorBoundary error={error} retry={retry} />;
}

export { ErrorBoundary };

// Before any screen renders an Image or loads a font.
patchExpoGoAssetUrls();
registerColorTokens();

// Svetlý/tmavý režim podľa Nastavení (pred vykreslením obrazoviek).
Uniwind.setTheme(applyTheme());

void SplashScreen.preventAutoHideAsync();

/**
 * Hneď po prihlásení zaregistruje Web Push subscription (lib/push.ts).
 * Zámerne v root layoute: Metro tak udrží VAPID kľúč v hlavnom bundli
 * (lenivé importy ho pri exporte vyhadzujú ako nepoužitý).
 * Samotná výzva na povolenie ostáva v Priateľoch (PushNotice).
 */
function usePushRegistration() {
  const userId = usePlayers((s) => s.session?.user.id);
  useEffect(() => {
    if (!userId || !pushSupported()) return;
    // Len ak už povolenie udelil (cez PushNotice) – nepýtame sa tu.
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    void ensurePushSubscription(userId);
  }, [userId]);
}

export default function RootLayout() {
  usePlayerSession();
  useOnlinePresence();
  // Záloha lokálnych dát k účtu (a spojenie so zálohou pri prihlásení).
  useAutoBackup();
  usePushRegistration();
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Report uncaught JS errors and unhandled promise rejections to parent (Bilt preview iframe)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const handleError = (event: ErrorEvent) => {
      const message = event.error?.stack ?? event.message ?? 'Unknown error';
      reportErrorToParent(message);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const err = event.reason;
      const message =
        err instanceof Error ? [err.message, err.stack].filter(Boolean).join('\n') : String(err);
      reportErrorToParent(message);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Inject Google Fonts link tag for web to ensure fonts load through proxy
  // Also register font family names as fallback if expo-font fails
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Check if link already exists
      const existingLink = document.querySelector(
        'link[href*="fonts.googleapis.com/css2?family=Inter"]',
      );

      if (!existingLink) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href =
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      }

      // Note: The @import in global.css and the link tag above ensure Inter font loads
      // expo-font will register the font family names (Inter_400Regular, etc.)
      // If expo-font fails due to proxy issues, the fonts should still be available
      // via the direct Google Fonts CDN link, though the specific font family names
      // might not be registered. The app should still render with Inter font.
    }
  }, []);

  useEffect(() => {
    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (__DEV__ && Platform.OS !== 'web' && !isExpoGo) {
      const timer = setTimeout(() => {
        DevClient.closeMenu();
        DevClient.hideMenu();
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      initPostHog();
    }
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      void SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: palette.paper },
            headerTintColor: palette.ink,
            headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: palette.paper },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="new-match" options={{ title: 'Nový zápas' }} />
          <Stack.Screen name="match" options={{ title: 'Zápas' }} />
          <Stack.Screen name="friend/new" options={{ title: 'Pridať priateľa' }} />
          <Stack.Screen name="friend/[id]" options={{ title: 'Priateľ' }} />
          <Stack.Screen name="account" options={{ title: 'Môj účet' }} />
          <Stack.Screen name="settings" options={{ title: 'Nastavenia' }} />
          <Stack.Screen name="online/index" options={{ title: 'Online zápasy' }} />
          <Stack.Screen name="online/new" options={{ title: 'Pozvať na zápas' }} />
          <Stack.Screen name="online/[id]" options={{ title: 'Online zápas' }} />
          <Stack.Screen name="conversation/[id]" options={{ title: 'Správy' }} />
          <Stack.Screen name="statistics" options={{ title: 'Štatistiky' }} />
          <Stack.Screen name="leaderboard" options={{ title: 'Rebríček' }} />
          <Stack.Screen name="games/index" options={{ title: 'Tréning' }} />
          <Stack.Screen name="games/cricket" options={{ title: 'Cricket' }} />
          <Stack.Screen name="games/clock" options={{ title: 'Around the Clock' }} />
          <Stack.Screen name="games/bobs" options={{ title: "Bob's 27" }} />
          <Stack.Screen name="games/c121" options={{ title: '121' }} />
          <Stack.Screen name="games/highscore" options={{ title: 'Highscore' }} />
          <Stack.Screen name="games/finishing" options={{ title: 'Finishing 50' }} />
          <Stack.Screen name="games/random-checkout" options={{ title: 'Random Checkout' }} />
          <Stack.Screen name="games/bull" options={{ title: 'Bull Challenge' }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Konverzácia' }} />
        </Stack>
        <InstallPrompt />
        <IncomingCallWatcher />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}

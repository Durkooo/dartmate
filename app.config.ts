import type { ConfigContext, ExpoConfig } from '@expo/config';

type ExpoPlugins = NonNullable<ExpoConfig['plugins']>;

export default ({ config }: ConfigContext): ExpoConfig => {
  const nativePlugins: ExpoPlugins =
    process.env.EXPO_PLATFORM === 'native'
      ? [['expo-dev-client', { launchMode: 'most-recent' }]]
      : [];

  return {
    ...config,
    name: 'DartMate',
    slug: 'dartmate',
    version: process.env.BILT_APP_VERSION ?? '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    scheme: 'dartmate',
    runtimeVersion: {
      policy: 'appVersion',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      deploymentTarget: '16.4',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          'Kamera umožňuje odfotiť obrázok do správy a pripojiť sa k videohovoru.',
        NSMicrophoneUsageDescription: 'Mikrofón slúži na rozhovor so súperom počas zápasu.',
      },
      supportsTablet: true,
      bundleIdentifier: process.env.BILT_IOS_BUNDLE_ID ?? 'me.bilt.dartmate',
    },
    android: {
      package: process.env.BILT_ANDROID_PACKAGE ?? 'me.bilt.dartmate',
      permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'],
    },
    web: {
      bundler: 'metro',
      // 'single' = SPA export: one index.html + client routing, so edge serving
      // needs only a single 404→index.html fallback rule.
      output: 'single',
      favicon: './public/icons/icon-192.png',
    },
    extra: {
      appStoreAppId: process.env.BILT_APP_STORE_APP_ID,
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-splash-screen',
      [
        'expo-image-picker',
        {
          photosPermission: 'Prístup k fotografiám umožňuje posielať obrázky priateľom v správach.',
          cameraPermission:
            'Kamera umožňuje odfotiť obrázok do správy a pripojiť sa k videohovoru.',
          microphonePermission: false,
        },
      ],
      '@livekit/react-native-expo-plugin',
      [
        '@config-plugins/react-native-webrtc',
        {
          cameraPermission:
            'Kamera umožňuje odfotiť obrázok do správy a pripojiť sa k videohovoru.',
          microphonePermission: 'Mikrofón slúži na rozhovor so súperom počas zápasu.',
        },
      ],
      ...nativePlugins,
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};

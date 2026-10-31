import { Target, Users, MessageCircle } from 'lucide-react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { palette, feedback } from '@/lib/darts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  return (
    <>
      {/* eslint-disable-next-line react/style-prop-object -- Expo StatusBar accepts a string appearance, not a React Native style object. */}
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: palette.paper },
          tabBarStyle: {
            backgroundColor: palette.white,
            borderTopColor: palette.line,
            height: 68 + bottom,
            paddingTop: 8,
            paddingBottom: bottom,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: palette.ink,
          tabBarInactiveTintColor: palette.muted,
          tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 0 },
        }}
        screenListeners={({ navigation, route }) => ({
          tabPress: () => {
            if (navigation.getState().routes[navigation.getState().index]?.key !== route.key)
              feedback.selection();
          },
        })}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Hra',
            tabBarIcon: ({ color }) => <Target size={23} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: 'Priatelia',
            tabBarIcon: ({ color }) => <Users size={23} color={color} strokeWidth={1.8} />,
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Správy',
            tabBarIcon: ({ color }) => <MessageCircle size={23} color={color} strokeWidth={1.8} />,
          }}
        />
      </Tabs>
    </>
  );
}

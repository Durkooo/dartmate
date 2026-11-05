import { View, KeyboardAvoidingView, Platform, ScrollView, type TextProps } from 'react-native';
import { Typography, Button, PressableFeedback, Skeleton } from 'heroui-native';
import { ChevronRight, MessageCircle, Target, AlertCircle } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, useDarts, type Friend } from '@/lib/darts';

export function Txt({ className = '', style, ...props }: TextProps & { className?: string }) {
  return (
    <Typography
      className={`text-foreground ${className}`}
      style={[{ fontFamily: 'Inter_400Regular' }, style]}
      {...props}
    />
  );
}
export function Heading({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Txt className={`text-[24px] leading-8 ${className}`} style={{ fontFamily: 'Inter_700Bold' }}>
      {children}
    </Txt>
  );
}
export function Page({
  children,
  form = false,
  safeTop = false,
  fallbackHref = '/',
  fallbackLabel = 'Späť domov',
  hideFallback = false,
}: {
  children: ReactNode;
  form?: boolean;
  safeTop?: boolean;
  fallbackHref?: Href;
  fallbackLabel?: string;
  /** Skryje spodné tlačidlo (obrazovka má vlastné). */
  hideFallback?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      className="bg-background flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={form}
      keyboardVerticalOffset={90}
      style={{ paddingTop: safeTop ? insets.top : 0 }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 32, flexGrow: 1 }}
      >
        <View className="w-full max-w-xl flex-1 self-center">
          {children}
          {!safeTop && !hideFallback && (
            <Button className="mt-5" variant="ghost" onPress={() => router.dismissTo(fallbackHref)}>
              <Button.Label>{fallbackLabel}</Button.Label>
            </Button>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Avatar({ friend, size = 48 }: { friend: Friend; size?: number }) {
  const initials = friend.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: palette[friend.color],
        borderRadius: size / 2,
      }}
      className="items-center justify-center"
    >
      <Txt style={{ fontFamily: 'Inter_600SemiBold', color: palette.ink, fontSize: size * 0.3 }}>
        {initials}
      </Txt>
    </View>
  );
}
export function FriendRow({
  friend,
  detail,
  action = 'chat',
}: {
  friend: Friend;
  detail?: string;
  action?: 'chat' | 'play';
}) {
  return (
    <PressableFeedback
      onPress={() =>
        router.push(
          action === 'chat'
            ? { pathname: '/chat/[id]', params: { id: friend.id } }
            : { pathname: '/new-match', params: { friendId: friend.id } },
        )
      }
      className="border-border flex-row items-center gap-3 border-b py-4"
    >
      <Avatar friend={friend} />
      <View className="flex-1 gap-1">
        <Txt numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>
          {friend.name}
        </Txt>
        <Txt className="text-muted text-[13px]" numberOfLines={2}>
          {detail ?? `@${friend.handle}`}
        </Txt>
      </View>
      {action === 'play' ? (
        <Target size={21} color={palette.ink} strokeWidth={1.8} />
      ) : (
        <ChevronRight size={20} color={palette.muted} strokeWidth={1.8} />
      )}
    </PressableFeedback>
  );
}
export function Empty({
  text,
  action,
  onPress,
  chat = false,
}: {
  text: string;
  action: string;
  onPress: () => void;
  chat?: boolean;
}) {
  return (
    <View className="items-center gap-4 py-10">
      {chat ? (
        <MessageCircle color={palette.muted} size={32} strokeWidth={1.8} />
      ) : (
        <Target color={palette.muted} size={32} strokeWidth={1.8} />
      )}
      <Txt className="text-muted text-center">{text}</Txt>
      <Button variant="secondary" onPress={onPress}>
        <Button.Label>{action}</Button.Label>
      </Button>
    </View>
  );
}
export function StorageNotice() {
  const error = useDarts((s) => s.storageError);
  const [pending, setPending] = useState(false);
  if (!error) return null;
  return (
    <View className="bg-danger-soft mb-4 gap-2 rounded-xl p-4">
      <AlertCircle size={20} color={palette.danger} />
      <Txt className="text-danger">
        Zmeny sa nepodarilo uložiť. Skontrolujte voľné miesto a skúste znova.
      </Txt>
      <Button
        variant="danger-soft"
        isDisabled={pending}
        onPress={async () => {
          setPending(true);
          await useDarts.getState().retryStorage();
          setPending(false);
        }}
      >
        <Button.Label>{pending ? 'Ukladám…' : 'Skúsiť znova'}</Button.Label>
      </Button>
    </View>
  );
}
export function LoadingRows() {
  return (
    <View className="gap-5 py-4">
      {[0, 1, 2].map((n) => (
        <View key={n} className="flex-row gap-3">
          <Skeleton className="size-12 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-5 w-3/4 rounded-md" />
            <Skeleton className="h-4 w-1/2 rounded-md" />
          </View>
        </View>
      ))}
    </View>
  );
}

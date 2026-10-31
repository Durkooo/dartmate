import { useRef, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Button, Input } from 'heroui-native';
import { Send, Target } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Empty, StorageNotice, LoadingRows } from '@/components/DartsUI';
import { palette, feedback, useDarts, type Message } from '@/lib/darts';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friends = useDarts((s) => s.friends);
  const allMessages = useDarts((s) => s.messages);
  const sendMessage = useDarts((s) => s.sendMessage);
  const hydrated = useDarts((s) => s.hydrated);
  const friend = friends.find((f) => f.id === id);
  const messages = allMessages.filter((m) => m.friendId === id);
  const [text, setText] = useState('');
  const list = useRef<FlatList<Message>>(null);
  const insets = useSafeAreaInsets();
  const send = () => {
    if (!text.trim() || !friend) return;
    sendMessage(id, text.trim());
    setText('');
    feedback.success();
  };
  if (!hydrated)
    return (
      <View className="bg-background flex-1 p-5">
        <LoadingRows />
      </View>
    );
  if (!friend)
    return (
      <View className="bg-background flex-1 p-5">
        <Empty
          text="Tohto priateľa tu nemáš."
          action="Späť k priateľom"
          onPress={() => router.replace('/friends')}
        />
      </View>
    );
  return (
    <KeyboardAvoidingView
      className="bg-background flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: friend.name }} />
      <View className="w-full max-w-xl flex-1 self-center">
        <View className="gap-3 px-5 pt-4">
          <StorageNotice />
          <View className="flex-row items-center justify-between gap-3">
            <Txt className="text-muted flex-1 text-[12px]">Prototyp · správy sa neodosielajú</Txt>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => router.push({ pathname: '/new-match', params: { friendId: id } })}
            >
              <Target size={17} color={palette.ink} />
              <Button.Label>Hrať</Button.Label>
            </Button>
          </View>
        </View>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <Animated.View
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(100)}
              style={{ alignSelf: item.mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}
            >
              <View
                className={`rounded-2xl px-4 py-3 ${item.mine ? 'bg-ink rounded-br-sm' : 'bg-surface rounded-bl-sm'}`}
              >
                <Txt className={item.mine ? 'leading-6 text-white' : 'leading-6'}>{item.text}</Txt>
                <Txt
                  className={`mt-2 text-right text-[11px] ${item.mine ? 'text-on-ink' : 'text-muted'}`}
                >
                  {item.time}
                </Txt>
              </View>
            </Animated.View>
          )}
          ListEmptyComponent={
            <Empty
              chat
              text="Tu sa začne vaša konverzácia."
              action="Napísať pozdrav"
              onPress={() => setText('Ahoj, dáme si šípky?')}
            />
          }
        />
        <View
          className="bg-surface border-border border-t px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="flex-row items-end gap-2">
            <Input
              className="bg-background max-h-28 flex-1"
              placeholder="Napíš správu…"
              accessibilityLabel="Správa"
              multiline
              value={text}
              onChangeText={setText}
              maxLength={2000}
            />
            <Button
              isIconOnly
              isDisabled={!text.trim()}
              accessibilityLabel="Uložiť správu"
              onPress={send}
            >
              <Send size={21} color={palette.ink} strokeWidth={1.8} />
            </Button>
          </View>
          <Button
            className="mt-1"
            variant="ghost"
            size="sm"
            onPress={() => router.dismissTo('/messages')}
          >
            <Button.Label>Všetky správy</Button.Label>
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

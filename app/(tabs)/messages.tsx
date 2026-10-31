import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableFeedback } from 'heroui-native';
import { router } from 'expo-router';
import { Heading, Txt, Avatar, Empty, LoadingRows } from '@/components/DartsUI';
import { useDarts } from '@/lib/darts';

export default function Messages() {
  const friends = useDarts((s) => s.friends);
  const messages = useDarts((s) => s.messages);
  const hydrated = useDarts((s) => s.hydrated);
  const insets = useSafeAreaInsets();
  const conversations = friends
    .map((friend) => ({ friend, last: messages.filter((m) => m.friendId === friend.id).at(-1) }))
    .filter((c) => c.last);
  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top }}>
      <FlatList
        data={hydrated ? conversations : []}
        keyExtractor={(c) => c.friend.id}
        contentContainerStyle={{
          padding: 20,
          flexGrow: 1,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View className="mb-5">
            <Heading>Správy</Heading>
            <Txt className="text-muted mt-3 text-[13px]">
              Ukážkové konverzácie · správy ostávajú u teba
            </Txt>
          </View>
        }
        renderItem={({ item }) => (
          <PressableFeedback
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.friend.id } })}
            className="border-border flex-row gap-3 border-b py-5"
          >
            <Avatar friend={item.friend} size={52} />
            <View className="flex-1 gap-2">
              <View className="flex-row gap-2">
                <Txt
                  className="flex-1"
                  numberOfLines={1}
                  style={{ fontFamily: 'Inter_600SemiBold' }}
                >
                  {item.friend.name}
                </Txt>
                <Txt className="text-muted text-[11px]">{item.last?.time}</Txt>
              </View>
              <Txt className="text-muted text-[13px] leading-5" numberOfLines={2}>
                {item.last?.mine ? 'Ty: ' : ''}
                {item.last?.text}
              </Txt>
            </View>
          </PressableFeedback>
        )}
        ListEmptyComponent={
          !hydrated ? (
            <LoadingRows />
          ) : (
            <Empty
              chat
              text="Tu nájdeš svoje konverzácie."
              action="Vybrať priateľa"
              onPress={() => router.push('/friends')}
            />
          )
        }
      />
    </View>
  );
}

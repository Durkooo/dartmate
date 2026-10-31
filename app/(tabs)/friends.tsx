import { useState } from 'react';
import { View, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input } from 'heroui-native';
import { UserPlus } from 'lucide-react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Heading, Txt, FriendRow, Empty, LoadingRows, StorageNotice } from '@/components/DartsUI';
import { palette, useDarts } from '@/lib/darts';

export default function Friends() {
  const [query, setQuery] = useState('');
  const friends = useDarts((s) => s.friends);
  const hydrated = useDarts((s) => s.hydrated);
  const insets = useSafeAreaInsets();
  const shown = friends.filter((f) =>
    `${f.name} ${f.handle}`.toLocaleLowerCase('sk').includes(query.trim().toLocaleLowerCase('sk')),
  );
  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top }}>
      <FlatList
        data={hydrated ? shown : []}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 32,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View className="mb-6 flex-row items-center justify-between">
              <Heading>Priatelia</Heading>
              <Button
                variant="secondary"
                isIconOnly
                accessibilityLabel="Pridať priateľa"
                onPress={() => router.push('/friend/new')}
              >
                <UserPlus size={21} color={palette.ink} strokeWidth={1.8} />
              </Button>
            </View>
            <StorageNotice />
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Hľadať meno alebo prezývku"
              accessibilityLabel="Hľadať priateľov"
              className="rounded-xl"
            />
            <View className="mt-7 mb-1 flex-row justify-between">
              <Txt className="text-muted text-[13px]">Tvoja partia</Txt>
              <Txt className="text-muted text-[13px]">
                {shown.length}{' '}
                {shown.length === 1
                  ? 'priateľ'
                  : shown.length < 5 && shown.length > 1
                    ? 'priatelia'
                    : 'priateľov'}
              </Txt>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <FriendRow
              friend={item}
              detail={item.demo ? `@${item.handle} · ukážkový hráč` : `@${item.handle}`}
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          !hydrated ? (
            <LoadingRows />
          ) : (
            <Empty
              text={query ? 'Takého priateľa tu zatiaľ nemáš.' : 'Tu bude tvoja šípkarská partia.'}
              action={query ? 'Vymazať hľadanie' : 'Pridať priateľa'}
              onPress={() => (query ? setQuery('') : router.push('/friend/new'))}
            />
          )
        }
        ListFooterComponent={
          <Button variant="outline" onPress={() => router.push('/friend/new')} className="mt-6">
            <UserPlus size={19} color={palette.ink} strokeWidth={1.8} />
            <Button.Label>Pridať priateľa</Button.Label>
          </Button>
        }
      />
    </View>
  );
}

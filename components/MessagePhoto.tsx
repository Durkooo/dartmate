import { useCallback, useState } from 'react';
import { Image, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Skeleton } from 'heroui-native';
import { ImageOff } from 'lucide-react-native';
import { bilt } from '@/lib/bilt';
import { feedback, palette } from '@/lib/darts';
import { MESSAGE_PHOTOS_BUCKET } from '@/lib/messagePhotos';
import { Txt } from '@/components/DartsUI';

export function MessagePhoto({ path, mine }: { path: string; mine: boolean }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoading(true);
      setError('');
      try {
        const { data, error: failure } = await bilt.storage
          .from(MESSAGE_PHOTOS_BUCKET)
          .createSignedUrl(path, 3600);
        if (failure) throw new Error(failure.message);
        if (!data?.signedUrl) throw new Error('Fotografiu sa nepodarilo načítať.');
        if (isActive()) setUrl(data.signedUrl);
      } catch (failure) {
        if (isActive()) {
          setError(
            failure instanceof Error ? failure.message : 'Fotografiu sa nepodarilo načítať.',
          );
          feedback.error();
        }
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [path],
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );
  return (
    <View style={{ width: '100%', height: 180 }} className="mb-2">
      {loading ? (
        <Skeleton className="h-full w-full rounded-xl" />
      ) : error ? (
        <View className="flex-1 items-center justify-center gap-2">
          <ImageOff size={24} color={mine ? palette.onInk : palette.muted} strokeWidth={1.8} />
          <Txt
            className={
              mine ? 'text-on-ink text-center text-[12px]' : 'text-muted text-center text-[12px]'
            }
            numberOfLines={2}
          >
            {error}
          </Txt>
          <Button size="sm" variant="secondary" onPress={() => void load()}>
            <Button.Label>Skúsiť znova</Button.Label>
          </Button>
        </View>
      ) : (
        <Image
          source={{ uri: url }}
          accessibilityLabel="Fotografia v správe"
          resizeMode="contain"
          style={{ width: '100%', height: 180, borderRadius: 12 }}
          onError={() => {
            setError('Fotografiu sa nepodarilo zobraziť.');
            feedback.error();
          }}
        />
      )}
    </View>
  );
}

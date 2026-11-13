import { useCallback, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Skeleton } from 'heroui-native';
import { Download, ImageOff, X } from 'lucide-react-native';
import { bilt } from '@/lib/bilt';
import { feedback, palette } from '@/lib/darts';
import { MESSAGE_PHOTOS_BUCKET } from '@/lib/messagePhotos';
import { Txt } from '@/components/DartsUI';

export function MessagePhoto({ path, mine }: { path: string; mine: boolean }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [saving, setSaving] = useState(false);
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
  // Stiahnutie do mobilu: bez natívnych modulov sa plné rozlíšenie otvorí
  // v prehliadači, odkiaľ sa fotka uloží podržaním prsta (iOS) / stiahnutím (Android).
  const download = async () => {
    if (!url || saving) return;
    setSaving(true);
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
      feedback.selection();
    } catch {
      feedback.error();
    } finally {
      setSaving(false);
    }
  };
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
        <>
          <Pressable
            accessibilityLabel="Zväčšiť fotografiu"
            onPress={() => {
              setZoomed(true);
              feedback.selection();
            }}
          >
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
          </Pressable>
          <Modal visible={zoomed} animationType="fade" onRequestClose={() => setZoomed(false)}>
            <View className="flex-1 bg-black">
              <View className="flex-1 items-center justify-center p-4">
                <Image
                  source={{ uri: url }}
                  accessibilityLabel="Fotografia v plnej veľkosti"
                  resizeMode="contain"
                  style={{ width: '100%', height: '100%' }}
                />
              </View>
              <View className="flex-row items-center justify-between gap-3 p-4">
                <Button
                  variant="secondary"
                  className="flex-1"
                  isDisabled={saving}
                  onPress={() => void download()}
                >
                  <Download size={18} strokeWidth={1.8} color={palette.yellow} />
                  <Button.Label>{saving ? 'Otváram…' : 'Stiahnuť fotku'}</Button.Label>
                </Button>
                <Button variant="secondary" isIconOnly onPress={() => setZoomed(false)}>
                  <X size={20} strokeWidth={1.8} color={palette.yellow} />
                </Button>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

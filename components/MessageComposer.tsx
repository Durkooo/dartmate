import { useState } from 'react';
import { Image, Modal, Platform, Pressable, View } from 'react-native';
import { Button, Input, Spinner } from 'heroui-native';
import { Camera, Image as ImageIcon, Send, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { feedback, palette } from '@/lib/darts';
import { MAX_MESSAGE_PHOTO_SIZE, type MessagePhotoDraft } from '@/lib/messagePhotos';

export function MessageComposer({
  text,
  onChangeText,
  photo,
  onSelectPhoto,
  onRemovePhoto,
  onError,
  onSend,
  pending,
  disabled,
  editing,
}: {
  text: string;
  onChangeText: (text: string) => void;
  photo: MessagePhotoDraft | null;
  onSelectPhoto: (asset: ImagePicker.ImagePickerAsset) => void;
  onRemovePhoto: () => void;
  onError: (message: string) => void;
  onSend: () => void;
  pending: boolean;
  disabled: boolean;
  editing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const busy = pending || picking;
  const pick = async (camera: boolean) => {
    setOpen(false);
    setPicking(true);
    try {
      if (camera && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          throw new Error('Povoľ prístup ku kamere v nastaveniach telefónu.');
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: false,
      };
      const result = await (camera
        ? ImagePicker.launchCameraAsync(options)
        : ImagePicker.launchImageLibraryAsync(options));
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if ((asset.fileSize ?? 0) > MAX_MESSAGE_PHOTO_SIZE)
          throw new Error('Fotografia je príliš veľká. Vyber obrázok menší než 10 MB.');
        onSelectPhoto(asset);
        feedback.selection();
      }
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : 'Fotografiu sa nepodarilo vybrať.');
      feedback.error();
    } finally {
      setPicking(false);
    }
  };
  return (
    <View className="flex-row items-end gap-2">
      {!editing && (
        <>
          <Button
            variant="secondary"
            isIconOnly
            className="rounded-full"
            isDisabled={busy || disabled}
            accessibilityLabel="Pridať fotografiu"
            onPress={() => {
              setOpen(true);
              feedback.selection();
            }}
          >
            <ImageIcon size={22} strokeWidth={1.8} color={palette.yellow} />
          </Button>
          <Modal
            visible={open}
            transparent
            animationType="fade"
            onRequestClose={() => setOpen(false)}
          >
            <Pressable
              className="flex-1 items-center justify-center bg-black/60 p-6"
              onPress={() => setOpen(false)}
            >
              <View className="bg-surface w-full max-w-[300px] gap-1 rounded-2xl p-2">
                <Button variant="ghost" className="justify-start" onPress={() => void pick(false)}>
                  <ImageIcon size={20} strokeWidth={1.8} color={palette.ink} />
                  <Button.Label>Z albumu</Button.Label>
                </Button>
                <Button variant="ghost" className="justify-start" onPress={() => void pick(true)}>
                  <Camera size={20} strokeWidth={1.8} color={palette.ink} />
                  <Button.Label>Kamera</Button.Label>
                </Button>
              </View>
            </Pressable>
          </Modal>
        </>
      )}
      <View className="bg-background min-w-0 flex-1 rounded-xl">
        {photo && (
          <View className="p-2 pb-0">
            <Image
              source={{ uri: photo.asset.uri }}
              resizeMode="contain"
              style={{ width: '100%', height: 120, borderRadius: 8 }}
              accessibilityLabel="Priložená fotografia"
            />
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              className="absolute top-2 right-2 rounded-full"
              isDisabled={busy}
              accessibilityLabel="Odstrániť fotografiu"
              onPress={onRemovePhoto}
            >
              <X size={17} strokeWidth={1.8} color={palette.yellow} />
            </Button>
          </View>
        )}
        <Input
          className="bg-background max-h-28"
          value={text}
          multiline
          maxLength={2000}
          editable={!busy}
          placeholder={photo ? 'Pridaj text…' : 'Napíš správu…'}
          accessibilityLabel={photo ? 'Text k fotografii' : 'Správa'}
          onChangeText={onChangeText}
        />
      </View>
      <Button
        isIconOnly
        isDisabled={busy || (!text.trim() && !photo) || disabled}
        accessibilityLabel={pending ? 'Odosielam správu' : 'Odoslať správu'}
        onPress={onSend}
      >
        {pending ? <Spinner size="sm" /> : <Send size={21} strokeWidth={1.8} color={palette.navy} />}
      </Button>
    </View>
  );
}

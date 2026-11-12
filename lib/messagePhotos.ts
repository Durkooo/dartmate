import type { ImagePickerAsset } from 'expo-image-picker';
import { bilt } from '@/lib/bilt';

export const MESSAGE_PHOTOS_BUCKET = 'message-photos';
export const MAX_MESSAGE_PHOTO_SIZE = 10 * 1024 * 1024;
export type MessagePhotoDraft = { asset: ImagePickerAsset; requestId: string };

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export async function uploadMessagePhoto(
  draft: MessagePhotoDraft,
  senderId: string,
  peerId: string,
): Promise<string> {
  const response = await fetch(draft.asset.uri);
  if (!response.ok) throw new Error('Fotografiu sa nepodarilo načítať. Vyber ju znova.');
  const file = draft.asset.file ?? (await response.blob());
  if (file.size > MAX_MESSAGE_PHOTO_SIZE)
    throw new Error('Fotografia je príliš veľká. Vyber obrázok menší než 10 MB.');
  const mime = file.type || draft.asset.mimeType || 'image/jpeg';
  const extension = extensions[mime];
  if (!extension)
    throw new Error(
      'Tento formát obrázka nie je podporovaný. Vyber JPG, PNG, WebP, GIF alebo HEIC.',
    );
  const path = `${senderId}/${peerId}/${draft.requestId}.${extension}`;
  const { error } = await bilt.storage
    .from(MESSAGE_PHOTOS_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeDraftMessagePhoto(path: string): Promise<void> {
  const { error } = await bilt.storage.from(MESSAGE_PHOTOS_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

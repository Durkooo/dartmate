import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { bilt } from '@/lib/bilt';

export const AVATARS_BUCKET = 'avatars';
/** Strana štvorcovej fotky v pixeloch (stačí aj na veľký krúžok, súbor má ~20–40 kB). */
const AVATAR_SIZE = 384;
/** Podpísaný odkaz platí 7 dní; pri každom načítaní priateľov sa vytvorí nový. */
const SIGNED_URL_TTL = 7 * 24 * 3600;

/** Web: vystrihne stred obrázka do štvorca, zmenší ho a uloží ako JPEG. */
async function squareJpeg(uri: string): Promise<Blob> {
  const image = new window.Image();
  image.decoding = 'async';
  image.src = uri;
  await image.decode();
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (!side) throw new Error('Fotku sa nepodarilo načítať. Vyber inú.');
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Fotku sa nepodarilo upraviť.');
  ctx.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) throw new Error('Fotku sa nepodarilo upraviť.');
  return blob;
}

async function avatarFile(asset: ImagePickerAsset): Promise<Blob> {
  if (Platform.OS === 'web') return squareJpeg(asset.uri);
  // Natívne: výrez 1:1 a kompresiu robí už výber fotky (allowsEditing + quality).
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('Fotku sa nepodarilo načítať. Vyber ju znova.');
  return response.blob();
}

/** Nahrá novú profilovú fotku, uloží ju do profilu a zmaže predošlú. */
export async function uploadAvatar(
  asset: ImagePickerAsset,
  userId: string,
  previousPath?: string | null,
): Promise<string> {
  const file = await avatarFile(asset);
  if (file.size > 2 * 1024 * 1024) throw new Error('Fotka je príliš veľká. Vyber menší obrázok.');
  // Nový názov pri každej zmene → priatelia nikdy neuvidia starú fotku z cache.
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await bilt.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  const { error: saveError } = await bilt.rpc('set_my_avatar', { new_path: path });
  if (saveError) {
    void bilt.storage.from(AVATARS_BUCKET).remove([path]);
    throw new Error(saveError.message);
  }
  if (previousPath && previousPath !== path)
    void bilt.storage.from(AVATARS_BUCKET).remove([previousPath]);
  return path;
}

/** Odstráni profilovú fotku (vráti sa krúžok s písmenami). */
export async function removeAvatar(path: string | null | undefined): Promise<void> {
  const { error } = await bilt.rpc('set_my_avatar', { new_path: null });
  if (error) throw new Error(error.message);
  if (path) await bilt.storage.from(AVATARS_BUCKET).remove([path]);
}

function text(row: unknown, key: string): string | undefined {
  if (typeof row !== 'object' || row === null) return undefined;
  const value: unknown = Reflect.get(row, key);
  return typeof value === 'string' && value ? value : undefined;
}

/** Podpísané odkazy na fotky (jedným volaním). Chyba = žiadne fotky, nie pád appky. */
export async function signAvatarUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  try {
    const { data, error } = await bilt.storage
      .from(AVATARS_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (error || !Array.isArray(data)) return urls;
    for (const item of data as unknown[]) {
      const path = text(item, 'path');
      const url = text(item, 'signedUrl');
      if (path && url) urls.set(path, url);
    }
  } catch {
    // Bez fotiek — ukážu sa písmená.
  }
  return urls;
}

/** user_id → podpísaný odkaz na fotku pre všetkých mojich priateľov, ktorí ju majú. */
export async function loadFriendAvatars(): Promise<Map<string, string>> {
  const byUser = new Map<string, string>();
  try {
    const { data, error } = await bilt.rpc('list_friend_avatars');
    if (error || !Array.isArray(data)) return byUser;
    const rows: { user_id: string; avatar_path: string }[] = [];
    for (const row of data as unknown[]) {
      const user_id = text(row, 'user_id');
      const avatar_path = text(row, 'avatar_path');
      if (user_id && avatar_path) rows.push({ user_id, avatar_path });
    }
    const urls = await signAvatarUrls(rows.map((r) => r.avatar_path));
    for (const r of rows) {
      const url = urls.get(r.avatar_path);
      if (url) byUser.set(r.user_id, url);
    }
  } catch {
    // SQL ešte nebolo spustené alebo výpadok — ostanú písmená.
  }
  return byUser;
}

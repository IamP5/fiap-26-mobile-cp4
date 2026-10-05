import * as ImagePicker from 'expo-image-picker';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
  type StorageReference,
} from 'firebase/storage';

import type { PickedImage } from '../types/user';
import { createAppError } from '../utils/errors';
import { storage } from './firebase';

/**
 * Photos are uploaded to Firebase Storage; only the resulting download URL
 * is saved in Firestore (never Base64).
 *   profile-photos/{uid}/<timestamp>.<ext>
 *   group-photos/{ownerUid}/<timestamp>.<ext>
 */
export type PhotoFolder = 'profile-photos' | 'group-photos';

/** Mirrors the 5 MB cap in storage.rules. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type PhotoSource = 'library' | 'camera';

export type PickResult =
  | { status: 'picked'; image: PickedImage }
  | { status: 'canceled' }
  | { status: 'denied'; message: string };

/** Asks for the needed permission, then opens the gallery or the camera. */
export const pickPhoto = async (source: PhotoSource): Promise<PickResult> => {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      status: 'denied',
      message:
        source === 'camera'
          ? 'Permita o acesso à câmera nas configurações do aparelho para tirar uma foto.'
          : 'Permita o acesso às fotos nas configurações do aparelho para escolher uma imagem.',
    };
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) {
    return { status: 'canceled' };
  }
  return { status: 'picked', image: { uri: asset.uri, mimeType: asset.mimeType ?? null } };
};

const extensionFor = (contentType: string): string => {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    default:
      return 'jpg';
  }
};

/** Uploads a picked image and returns its download URL. Timestamped names
 * give a replaced photo a NEW url, so cached images never show stale bytes. */
export const uploadPhoto = async (folder: PhotoFolder, uid: string, image: PickedImage): Promise<string> => {
  const response: Response = await fetch(image.uri);
  if (!response.ok) {
    throw createAppError('Não foi possível ler a imagem selecionada. Tente novamente.');
  }
  const blob: Blob = await response.blob();
  if (blob.size > MAX_PHOTO_BYTES) {
    throw createAppError('A imagem é muito grande (máximo de 5 MB). Escolha outra foto.');
  }
  const candidate: string = image.mimeType ?? blob.type;
  const contentType: string = candidate.startsWith('image/') ? candidate : 'image/jpeg';
  const target: StorageReference = storageRef(
    storage,
    `${folder}/${uid}/${Date.now()}.${extensionFor(contentType)}`,
  );
  await uploadBytes(target, blob, { contentType });
  return getDownloadURL(target);
};

/** Best-effort cleanup of a replaced upload; never throws. */
export const deletePhotoByUrl = async (folder: PhotoFolder, uid: string, url: string): Promise<void> => {
  const ours: boolean = url.includes(`/${folder}%2F${uid}%2F`);
  if (!ours) {
    return;
  }
  try {
    await deleteObject(storageRef(storage, url));
  } catch {
    // an orphaned object is harmless
  }
};

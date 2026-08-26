import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
  type StorageReference,
} from 'firebase/storage';

import { storage } from './firebase';
import { createAppError } from '../utils/errors';

const PROFILE_PHOTOS_PATH = 'profile-photos';

/** Mirrors the 5 MB cap enforced by storage.rules so oversized picks fail
 * with a friendly message instead of a permission error. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const extensionForContentType = (contentType: string): string => {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/heic':
      return 'heic';
    default:
      return 'jpg';
  }
};

const resolveContentType = (mimeType: string | null, blobType: string): string => {
  const candidate: string = mimeType ?? blobType;
  return candidate.startsWith('image/') ? candidate : 'image/jpeg';
};

/**
 * Uploads the picked/captured image (a local `file://`/`blob:` uri from
 * expo-image-picker) to profile-photos/$uid and returns its download url.
 * The filename is timestamped so a replaced photo gets a NEW url — cached
 * <Image> components would otherwise keep showing the old bytes.
 */
export const uploadProfilePhoto = async (
  uid: string,
  localUri: string,
  mimeType: string | null,
): Promise<string> => {
  const response: Response = await fetch(localUri);
  if (!response.ok) {
    throw createAppError('Não foi possível ler a imagem selecionada. Tente novamente.');
  }
  const blob: Blob = await response.blob();
  if (blob.size > MAX_PHOTO_BYTES) {
    throw createAppError('A imagem é muito grande (máximo de 5 MB). Escolha outra foto.');
  }
  const contentType: string = resolveContentType(mimeType, blob.type);
  const path: string = `${PROFILE_PHOTOS_PATH}/${uid}/${Date.now()}.${extensionForContentType(contentType)}`;
  const target: StorageReference = storageRef(storage, path);
  await uploadBytes(target, blob, { contentType });
  return getDownloadURL(target);
};

/** True when the url points at an object this app uploaded for this uid
 * (provider photos live on Google's CDN and must never be "cleaned up"). */
const isOwnProfilePhotoUrl = (uid: string, url: string): boolean =>
  url.includes(`/${PROFILE_PHOTOS_PATH}%2F${uid}%2F`) ||
  url.includes(`/${PROFILE_PHOTOS_PATH}/${uid}/`);

/**
 * Best-effort removal of a replaced upload so the bucket doesn't accumulate
 * one orphan per photo change. Never throws: the new photo is already live,
 * and a leftover object is harmless.
 */
export const deleteProfilePhotoByUrl = async (
  uid: string,
  url: string | null,
): Promise<void> => {
  if (url === null || !isOwnProfilePhotoUrl(uid, url)) {
    return;
  }
  try {
    await deleteObject(storageRef(storage, url));
  } catch {
    // orphaned objects are acceptable; deletion is purely housekeeping
  }
};

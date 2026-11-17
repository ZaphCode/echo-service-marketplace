import * as FileSystem from "expo-file-system/legacy";

import { supabase } from "@/lib/supabase";
import { decodeBase64 } from "@/utils/base64";

const STORAGE_PUBLIC_PATH = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function isLocalUri(value: string) {
  return /^(file|content|ph|assets-library):\/\//i.test(value);
}

export function normalizeStoragePath(bucket: string, value: string) {
  if (!value || !isRemoteUrl(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const match = url.pathname.match(STORAGE_PUBLIC_PATH);

    if (!match) {
      return value;
    }

    const [, bucketName, filePath] = match;
    return bucketName === bucket ? decodeURIComponent(filePath) : value;
  } catch {
    return value;
  }
}

export function resolveStorageUrl(bucket: string, value?: string | null) {
  if (!value) {
    return "";
  }

  if (isRemoteUrl(value) || isLocalUri(value)) {
    return value;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(value);

  return publicUrl;
}

async function uploadImage(
  bucket: string,
  filePath: string,
  imageUri: string,
  contentType = "image/jpeg"
) {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = decodeBase64(base64);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, bytes, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(
      `Storage upload failed for ${bucket}/${filePath}: ${error.message}`
    );
  }

  return filePath;
}

export async function uploadAvatarImage(userId: string, imageUri: string) {
  const { extension, contentType } = getFileMetadata(imageUri);
  const filePath = `${userId}/avatar_${Date.now()}.${extension}`;
  return uploadImage("avatars", filePath, imageUri, contentType);
}

export async function uploadServiceImages(
  providerId: string,
  photos: string[]
) {
  return Promise.all(
    photos.map(async (photo, index) => {
      if (isLocalUri(photo)) {
        const { extension, contentType } = getFileMetadata(photo);
        const filePath = `${providerId}/service_${Date.now()}_${index}.${extension}`;
        return uploadImage("service-photos", filePath, photo, contentType);
      }

      return normalizeStoragePath("service-photos", photo);
    })
  );
}

export async function uploadContractingImages(ownerId: string, photos: string[]) {
  return Promise.all(
    photos.map(async (photo, index) => {
      if (isLocalUri(photo)) {
        const { extension, contentType } = getFileMetadata(photo);
        const filePath = `${ownerId}/contracting_${Date.now()}_${index}.${extension}`;
        return uploadImage("service-photos", filePath, photo, contentType);
      }

      return normalizeStoragePath("service-photos", photo);
    })
  );
}

function getFileMetadata(uri: string) {
  const normalizedUri = uri.split("?")[0].toLowerCase();

  if (normalizedUri.endsWith(".png")) {
    return { extension: "png", contentType: "image/png" };
  }

  if (normalizedUri.endsWith(".webp")) {
    return { extension: "webp", contentType: "image/webp" };
  }

  if (normalizedUri.endsWith(".heic") || normalizedUri.endsWith(".heif")) {
    return { extension: "heic", contentType: "image/heic" };
  }

  return { extension: "jpg", contentType: "image/jpeg" };
}

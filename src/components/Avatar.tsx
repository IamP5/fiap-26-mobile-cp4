import { Users } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { maxFontScale } from '@/theme/theme';

export const initialsOf = (name: string): string => {
  const parts: string[] = name.trim().split(/\s+/).filter((p: string) => p.length > 0);
  if (parts.length === 0) {
    return '?';
  }
  const firstPart: string | undefined = parts[0];
  const lastPart: string | undefined = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const first: string = firstPart === undefined ? '' : firstPart.charAt(0);
  const last: string = lastPart === undefined ? '' : lastPart.charAt(0);
  const initials: string = `${first}${last}`.toUpperCase();
  return initials.length > 0 ? initials : '?';
};

// Simple deterministic char-code hash so the same uid always maps to the
// same hue. The palette is identical in both schemes, so avatars never shift
// color on a theme flip.
export const avatarColorFor = (uid: string, palette: readonly string[]): string => {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) % palette.length;
    if (hash < 0) {
      hash += palette.length;
    }
  }
  const picked: string | undefined = palette[hash];
  return picked !== undefined ? picked : (palette[0] as string);
};

export type AvatarProps = {
  name: string;
  uid: string;
  /** Storage download URL; empty, missing or failing = default image. */
  photoUrl?: string | null;
  size?: number;
  /** Default image when there is no photo: initials for people, a group
   * glyph for groups. */
  variant?: 'person' | 'group';
  className?: string;
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  uid,
  photoUrl,
  size = 44,
  variant = 'person',
  className,
}: AvatarProps) => {
  const colors = useThemeColors();
  const initials: string = useMemo(() => initialsOf(name), [name]);
  const tint: string = useMemo(() => avatarColorFor(uid, colors.avatarPalette), [uid, colors.avatarPalette]);

  // A photo that fails to load falls back to initials; a NEW url gets a fresh
  // chance (e.g. after re-syncing the provider photo).
  const [photoFailed, setPhotoFailed] = useState<boolean>(false);
  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl]);
  const handlePhotoError = useCallback((): void => setPhotoFailed(true), []);

  const showPhoto: boolean = typeof photoUrl === 'string' && photoUrl.length > 0 && !photoFailed;
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      className={cn('items-center justify-center overflow-hidden', className)}
      style={[dimension, { backgroundColor: tint }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {showPhoto ? (
        <Image
          source={{ uri: photoUrl as string }}
          style={dimension}
          onError={handlePhotoError}
          accessibilityIgnoresInvertColors
        />
      ) : variant === 'group' ? (
        <Icon as={Users} size={Math.round(size * 0.46)} className="text-white" />
      ) : (
        <Text
          className="font-semibold text-white"
          style={{ fontSize: Math.round(size * 0.38) }}
          maxFontSizeMultiplier={maxFontScale.chrome}
        >
          {initials}
        </Text>
      )}
    </View>
  );
};

export default Avatar;

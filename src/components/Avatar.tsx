import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../theme/ThemeContext';
import { layout, maxFontScale } from '../theme/theme';

// Lifted verbatim from the previous UserItem implementation so both the
// contact list and chat bubbles share the exact same fallback rules.
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
// same hue, without needing a crypto-quality hash. The palette is identical
// in both schemes, so avatars never shift color on a theme flip.
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
  /** Provider photo (Google account picture); null/undefined = initials. */
  photoUrl?: string | null;
  size?: number;
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  uid,
  photoUrl,
  size = layout.avatar.md,
}: AvatarProps) => {
  const colors = useThemeColors();
  const initials: string = useMemo(() => initialsOf(name), [name]);
  const backgroundColor: string = useMemo(
    () => avatarColorFor(uid, colors.avatarPalette),
    [uid, colors.avatarPalette],
  );
  const fontSize: number = Math.round(size * 0.38);

  // A photo that fails to load falls back to initials; a NEW url gets a fresh
  // chance (e.g. after re-syncing the provider photo).
  const [photoFailed, setPhotoFailed] = useState<boolean>(false);
  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl]);
  const handlePhotoError = useCallback((): void => {
    setPhotoFailed(true);
  }, []);

  const showPhoto: boolean =
    typeof photoUrl === 'string' && photoUrl.length > 0 && !photoFailed;

  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {showPhoto ? (
        <Image
          source={{ uri: photoUrl as string }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={handlePhotoError}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={[styles.initials, { fontSize, color: colors.avatarText }]}
          maxFontSizeMultiplier={maxFontScale.chrome}
        >
          {initials}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontWeight: '700',
  },
});

export default Avatar;

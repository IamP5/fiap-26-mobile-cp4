import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { pickPhoto, type PhotoSource, type PickResult } from '../services/photoService';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { spacing, type Theme } from '../theme/theme';
import type { PickedImage } from '../types/user';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export type PhotoPickerProps = {
  name: string;
  uid: string;
  /** Current photo: a picked local image or a stored URL. */
  photoUri: string;
  onPicked: (image: PickedImage) => void;
  onError: (message: string) => void;
  variant?: 'person' | 'group';
  busy?: boolean;
  disabled?: boolean;
  size?: number;
  label?: string;
};

/** Avatar with a camera badge: choose from the gallery or take a photo,
 * asking for the matching permission first. */
export const PhotoPicker: React.FC<PhotoPickerProps> = ({
  name,
  uid,
  photoUri,
  onPicked,
  onError,
  variant = 'person',
  busy = false,
  disabled = false,
  size = 96,
  label = 'Escolher foto',
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [picking, setPicking] = useState<boolean>(false);

  const run = useCallback(
    (source: PhotoSource): void => {
      setPicking(true);
      pickPhoto(source)
        .then((result: PickResult) => {
          if (result.status === 'picked') {
            onPicked(result.image);
          } else if (result.status === 'denied') {
            onError(result.message);
          }
        })
        .catch(() => onError('Não foi possível abrir as fotos. Tente novamente.'))
        .finally(() => setPicking(false));
    },
    [onPicked, onError],
  );

  const handlePress = useCallback((): void => {
    if (Platform.OS === 'web') {
      run('library');
      return;
    }
    Alert.alert(label, undefined, [
      { text: 'Galeria', onPress: () => run('library') },
      { text: 'Câmera', onPress: () => run('camera') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [label, run]);

  const working: boolean = busy || picking;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || working}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }: { pressed: boolean }) => [styles.wrap, pressed ? styles.pressed : null]}
    >
      <View>
        <Avatar name={name.length > 0 ? name : '?'} uid={uid} photoUrl={photoUri} size={size} variant={variant} />
        <View style={styles.badge}>
          {working ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Icon name="camera" size={16} color={colors.onPrimary} />
          )}
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', alignSelf: 'center' },
    pressed: { opacity: 0.8 },
    badge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { marginTop: spacing.sm, fontSize: 14, fontWeight: '600', color: colors.primary },
  });

export default PhotoPicker;

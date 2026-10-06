import React, { useCallback, useState } from 'react';
import { Camera } from 'lucide-react-native';
import { ActivityIndicator, Alert, Platform, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressableScale } from '@/components/motion/PressableScale';
import { Icon } from '@/components/ui/icon';
import { haptics } from '@/lib/haptics';
import { fadeIn, popIn } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { pickPhoto, type PhotoSource, type PickResult } from '@/services/photoService';
import { useThemeColors } from '@/theme/ThemeContext';
import type { PickedImage } from '@/types/user';
import { Avatar } from './Avatar';

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
  /** Validation message shown under the label (e.g. a required photo). */
  error?: string;
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
  error,
}) => {
  const colors = useThemeColors();
  const [picking, setPicking] = useState<boolean>(false);

  const run = useCallback(
    (source: PhotoSource): void => {
      setPicking(true);
      pickPhoto(source)
        .then((result: PickResult) => {
          if (result.status === 'picked') {
            haptics.success();
            onPicked(result.image);
          } else if (result.status === 'denied') {
            haptics.error();
            onError(result.message);
          }
        })
        .catch(() => onError('Não foi possível abrir as fotos. Tente novamente.'))
        .finally(() => setPicking(false));
    },
    [onPicked, onError],
  );

  const handlePress = useCallback((): void => {
    haptics.tap();
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
  const inactive: boolean = disabled || working;

  return (
    <PressableScale
      activeScale={0.95}
      onPress={handlePress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: working }}
      className={cn('items-center self-center', disabled && !working && 'opacity-60')}
    >
      <View>
        <View className="border-border rounded-full border p-1">
          <Avatar name={name.length > 0 ? name : '?'} uid={uid} photoUrl={photoUri} size={size} variant={variant} />
        </View>
        <Animated.View
          entering={popIn}
          className="bg-primary border-card absolute bottom-0.5 right-0.5 size-8 items-center justify-center rounded-full border-[3px] shadow-md shadow-primary/30"
        >
          {working ? (
            <Animated.View key="spinner" entering={fadeIn}>
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            </Animated.View>
          ) : (
            <Animated.View key="camera" entering={fadeIn}>
              <Icon as={Camera} strokeWidth={2.25} className="text-primary-foreground size-3.5" />
            </Animated.View>
          )}
        </Animated.View>
      </View>
      <Text className="text-primary mt-3 text-sm font-medium">{label}</Text>
      {error !== undefined ? <Text className="text-destructive mt-1 text-xs">{error}</Text> : null}
    </PressableScale>
  );
};

export default PhotoPicker;

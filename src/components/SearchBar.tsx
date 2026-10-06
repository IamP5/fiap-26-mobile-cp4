import { Search, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { haptics } from '@/lib/haptics';
import { popIn, popOut } from '@/lib/motion';
import { isMaterial } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { maxFontScale } from '@/theme/theme';

export type SearchBarProps = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
};

/**
 * Platform search field: the iOS 26 capsule (Telegram) or the Material 3
 * search bar (WhatsApp) — a filled pill, no outline or focus ring. The clear
 * button appears once there is text.
 */
export const SearchBar: React.FC<SearchBarProps> = ({ value, onChangeText, placeholder = 'Pesquisar' }) => {
  const colors = useThemeColors();
  const hasValue: boolean = value.length > 0;

  return (
    <View
      className={cn(
        'bg-muted flex-row items-center rounded-full',
        isMaterial ? 'h-12 gap-3 pl-4 pr-3' : 'h-10 gap-2 pl-3 pr-2',
      )}
    >
      <Icon as={Search} className={cn('text-muted-foreground', isMaterial ? 'size-5' : 'size-[18px]')} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        className={cn('text-foreground h-full flex-1 web:outline-none', isMaterial ? 'text-base' : 'text-[16px]')}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        maxFontSizeMultiplier={maxFontScale.chrome}
      />
      {hasValue ? (
        <Animated.View entering={popIn} exiting={popOut}>
          <Pressable
            onPress={() => {
              haptics.tap();
              onChangeText('');
            }}
            accessibilityRole="button"
            accessibilityLabel="Limpar pesquisa"
            hitSlop={8}
            className={cn(
              'items-center justify-center rounded-full active:opacity-60',
              isMaterial ? 'size-6' : 'bg-muted-foreground/40 size-[18px]',
            )}
          >
            <Icon
              as={X}
              strokeWidth={isMaterial ? 2 : 3}
              className={cn(isMaterial ? 'text-muted-foreground size-5' : 'text-background size-3')}
            />
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
};

export default SearchBar;

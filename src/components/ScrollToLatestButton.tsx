import { ChevronDown } from 'lucide-react-native';
import React from 'react';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

import { Glass } from '@/components/native/Glass';
import { Icon } from '@/components/ui/icon';
import { haptics } from '@/lib/haptics';
import { riseIn, riseOut } from '@/lib/motion';
import { hasLiquidGlass, isMaterial } from '@/lib/platform';
import { useThemeColors } from '@/theme/ThemeContext';
import { androidRipple } from '@/theme/theme';

export type ScrollToLatestButtonProps = {
  visible: boolean;
  /** Distance from the bottom edge (clears a floating composer). */
  bottom?: number;
  onPress: () => void;
};

/**
 * Floating "jump to latest" control shown once the user scrolls up: a Liquid
 * Glass circle on iOS, a small elevated surface on Android (WhatsApp).
 */
export const ScrollToLatestButton: React.FC<ScrollToLatestButtonProps> = ({ visible, bottom = 12, onPress }) => {
  const colors = useThemeColors();
  if (!visible) {
    return null;
  }
  const handlePress = (): void => {
    haptics.tap();
    onPress();
  };
  const glyph = <Icon as={ChevronDown} className="text-foreground size-[22px]" />;

  return (
    // Liquid Glass does not render under a parent animating from opacity 0,
    // so on iOS 26 the glass circle simply appears.
    <Animated.View
      entering={hasLiquidGlass ? undefined : riseIn}
      exiting={hasLiquidGlass ? undefined : riseOut}
      style={{ position: 'absolute', right: 12, bottom }}
    >
      {isMaterial ? (
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Ir para a mensagem mais recente"
          android_ripple={androidRipple(colors.ripple)}
          className="size-10 items-center justify-center overflow-hidden rounded-full"
          style={{ elevation: 3, backgroundColor: colors.card }}
        >
          {glyph}
        </Pressable>
      ) : (
        <Glass radius={20} className="size-10">
          <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel="Ir para a mensagem mais recente"
            className="size-10 items-center justify-center active:opacity-60"
          >
            {glyph}
          </Pressable>
        </Glass>
      )}
    </Animated.View>
  );
};

export default ScrollToLatestButton;

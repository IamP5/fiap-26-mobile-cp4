import { GlassView } from 'expo-glass-effect';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { hasLiquidGlass } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useThemeContext } from '@/theme/ThemeContext';

export type GlassProps = ViewProps & {
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Corner radius: glass needs a numeric radius (capsules = height / 2). */
  radius: number;
  /** Optional tint, e.g. the accent color for a primary glass button. */
  tintColor?: string;
  /** Classes for the non-glass fallback surface (older iOS, Android, web). */
  fallbackClassName?: string;
};

// Web has no native material: a blurred translucent fill stands in for glass.
/** react-native-web passes CSS-only properties through to the DOM. */
type WebViewStyle = ViewStyle & { backdropFilter?: string };
const webGlass: WebViewStyle | null = Platform.OS === 'web' ? { backdropFilter: 'blur(20px) saturate(180%)' } : null;

/**
 * Liquid Glass surface for floating chrome (bars, capsules, round controls).
 * On iOS 26 the real system material sits behind the content as a layer —
 * the outer View owns layout (classNames work as usual), the native glass
 * just fills it. Elsewhere it degrades to a translucent card with a hairline.
 */
export const Glass: React.FC<GlassProps> = ({
  className,
  style,
  radius,
  tintColor,
  fallbackClassName,
  children,
  ...props
}) => {
  const { scheme } = useThemeContext();

  if (hasLiquidGlass) {
    return (
      <View className={className} style={[{ borderRadius: radius }, style]} {...props}>
        <GlassView
          glassEffectStyle="regular"
          colorScheme={scheme}
          tintColor={tintColor}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
        {children}
      </View>
    );
  }

  return (
    <View
      className={cn(
        tintColor === undefined && 'bg-card/85 border-border/70 border',
        'overflow-hidden',
        fallbackClassName,
        className,
      )}
      style={[
        { borderRadius: radius },
        tintColor !== undefined ? { backgroundColor: tintColor } : null,
        webGlass,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

export default Glass;

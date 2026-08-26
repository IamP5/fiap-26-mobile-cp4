import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '../theme/ThemeContext';
import { layout, spacing, type Theme } from '../theme/theme';

// Mirrors UserItem's row geometry exactly (68px min height, 44px avatar
// circle, two text bars) so the transition from skeleton to real data never
// pops the layout. Pulses opacity via the native driver so it can never
// block VirtualizedList row rendering.
export const UserItemSkeleton: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 900,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    loop.start();
    return (): void => {
      loop.stop();
    };
  }, [opacity]);

  return (
    <View
      style={styles.container}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.avatar, { opacity }]} />
      <View style={styles.info}>
        <Animated.View style={[styles.bar, styles.barWide, { opacity }]} />
        <Animated.View style={[styles.bar, styles.barNarrow, { opacity }]} />
      </View>
    </View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 68,
      paddingVertical: spacing.sm + spacing.xxs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.background,
    },
    avatar: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: layout.avatar.md / 2,
      backgroundColor: colors.surfaceSunken,
      marginRight: spacing.md,
    },
    info: {
      flex: 1,
      gap: spacing.sm,
    },
    bar: {
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.surfaceSunken,
    },
    barWide: {
      width: '45%',
    },
    barNarrow: {
      width: '70%',
    },
  });

export default UserItemSkeleton;

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, layout, spacing, type Theme } from '../theme/theme';
import { Icon } from './Icon';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Optional element left of the title (e.g. an avatar). */
  leading?: React.ReactNode;
  /** Makes the title block tappable (e.g. open profile / members). */
  onTitlePress?: () => void;
  titleAccessibilityLabel?: string;
  right?: React.ReactNode;
};

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  onBack,
  leading,
  onTitlePress,
  titleAccessibilityLabel,
  right,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const titleBlock = (
    <>
      {leading}
      <View style={[styles.titles, leading !== undefined ? styles.titlesWithLeading : null]}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      {onBack !== undefined ? (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          android_ripple={androidRipple(colors.ripple, true)}
          style={({ pressed }: { pressed: boolean }) => [styles.back, pressed ? styles.pressed : null]}
        >
          <Icon name="chevron-left" color={colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.sideSpacer} />
      )}
      {onTitlePress !== undefined ? (
        <Pressable
          onPress={onTitlePress}
          accessibilityRole="button"
          accessibilityLabel={titleAccessibilityLabel ?? title}
          style={({ pressed }: { pressed: boolean }) => [styles.titleArea, pressed ? styles.pressed : null]}
        >
          {titleBlock}
        </Pressable>
      ) : (
        <View style={styles.titleArea}>{titleBlock}</View>
      )}
      {right !== undefined ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: layout.hairline,
      borderBottomColor: colors.separator,
    },
    back: { width: layout.touchTarget, height: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
    sideSpacer: { width: spacing.sm },
    pressed: { opacity: 0.7 },
    titleArea: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: layout.touchTarget },
    titles: { flex: 1 },
    titlesWithLeading: { marginLeft: spacing.sm + spacing.xs },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    subtitle: { marginTop: 1, fontSize: 13, color: colors.muted },
    right: { marginLeft: spacing.sm },
  });

export default ScreenHeader;

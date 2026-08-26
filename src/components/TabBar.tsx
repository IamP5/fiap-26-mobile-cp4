import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, maxFontScale, radius, spacing, type Theme } from '../theme/theme';
import type { ChatUser } from '../types/user';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export type HomeTab = 'chats' | 'you';

export const TAB_BAR_HEIGHT = 64;

/**
 * Extra bottom padding a tab screen's scrollable content needs so the last
 * row is not hidden behind the floating bar.
 */
export const tabBarClearance = (bottomInset: number): number =>
  bottomInset + spacing.sm + TAB_BAR_HEIGHT + spacing.md;

export type TabBarProps = {
  active: HomeTab;
  onChange: (tab: HomeTab) => void;
  me: ChatUser;
  /** Total unread messages across conversations; 0 hides the badge. */
  unreadTotal: number;
};

/**
 * WhatsApp-style floating tab bar: a detached pill hovering over the content
 * with the two home destinations — the conversation list and the user's own
 * space (profile + settings).
 */
export const TabBar: React.FC<TabBarProps> = ({ active, onChange, me, unreadTotal }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const chatsSelected: boolean = active === 'chats';
  const youSelected: boolean = active === 'you';

  const unreadHint: string =
    unreadTotal > 0
      ? `, ${unreadTotal} ${unreadTotal === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`
      : '';

  return (
    <View
      style={[styles.bar, { bottom: insets.bottom + spacing.sm }]}
      accessibilityRole="tablist"
    >
      <Pressable
        onPress={() => onChange('chats')}
        accessibilityRole="tab"
        accessibilityLabel={`Conversas${unreadHint}`}
        accessibilityState={{ selected: chatsSelected }}
        android_ripple={androidRipple(colors.ripple)}
        style={({ pressed }: { pressed: boolean }) => [
          styles.item,
          pressed ? styles.itemPressed : null,
        ]}
      >
        <View style={styles.iconWrap}>
          <Icon name="chat" size={24} color={chatsSelected ? colors.primary : colors.muted} />
          {unreadTotal > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText} maxFontSizeMultiplier={maxFontScale.chrome}>
                {unreadTotal > 99 ? '99+' : unreadTotal}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.label, chatsSelected ? styles.labelActive : null]}
          maxFontSizeMultiplier={maxFontScale.chrome}
        >
          Conversas
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onChange('you')}
        accessibilityRole="tab"
        accessibilityLabel="Você"
        accessibilityState={{ selected: youSelected }}
        android_ripple={androidRipple(colors.ripple)}
        style={({ pressed }: { pressed: boolean }) => [
          styles.item,
          pressed ? styles.itemPressed : null,
        ]}
      >
        <View style={[styles.avatarRing, youSelected ? styles.avatarRingActive : null]}>
          <Avatar name={me.name} uid={me.uid} photoUrl={me.photoUrl} size={24} />
        </View>
        <Text
          style={[styles.label, youSelected ? styles.labelActive : null]}
          maxFontSizeMultiplier={maxFontScale.chrome}
        >
          Você
        </Text>
      </Pressable>
    </View>
  );
};

const createStyles = ({ colors, elevation }: Theme) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      height: TAB_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      ...elevation.floating,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderRadius: radius.pill,
    },
    itemPressed: {
      backgroundColor: colors.surfaceSunken,
    },
    iconWrap: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -6,
      left: 18,
      minWidth: 18,
      height: 18,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xs,
      backgroundColor: colors.unreadBadge,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    // Constant-size ring: transparent border when idle so selecting the tab
    // does not shift the avatar.
    avatarRing: {
      padding: 1,
      borderWidth: 2,
      borderColor: 'transparent',
      borderRadius: radius.pill,
    },
    avatarRingActive: {
      borderColor: colors.primary,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
    },
    labelActive: {
      color: colors.primary,
    },
  });

export default TabBar;

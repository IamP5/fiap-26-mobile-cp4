import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, layout, spacing, type Theme } from '../theme/theme';
import type { PublicProfile } from '../types/user';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export type UserItemProps = {
  user: PublicProfile;
  onPress: (user: PublicProfile) => void;
  /** Selection mode (group members): undefined renders a plain row. */
  selected?: boolean;
  disabled?: boolean;
  /** Small caption under the name (e.g. "Já está no grupo"). */
  caption?: string;
};

export const UserItem: React.FC<UserItemProps> = ({ user, onPress, selected, disabled = false, caption }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const handlePress = useCallback((): void => onPress(user), [onPress, user]);
  const selectable: boolean = selected !== undefined;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: selected, disabled } : { disabled }}
      accessibilityLabel={selectable ? user.name : `Conversar com ${user.name}`}
      android_ripple={androidRipple(colors.ripple)}
      style={({ pressed }: { pressed: boolean }) => [
        styles.row,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Avatar name={user.name} uid={user.uid} photoUrl={user.photoUrl} size={layout.avatar.md} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {user.name}
        </Text>
        {caption !== undefined ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      {selectable ? (
        <View style={[styles.check, selected === true ? styles.checkOn : null]}>
          {selected === true ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
        </View>
      ) : (
        <Icon name="chevron-right" size={14} color={colors.muted} />
      )}
    </Pressable>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm + spacing.xxs,
      paddingHorizontal: spacing.md,
      minHeight: 64,
      backgroundColor: colors.background,
    },
    pressed: { backgroundColor: colors.surface },
    disabled: { opacity: 0.5 },
    info: { flex: 1, marginLeft: spacing.md },
    name: { fontSize: 16, fontWeight: '600', color: colors.text },
    caption: { marginTop: 2, fontSize: 13, color: colors.muted },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  });

export default UserItem;

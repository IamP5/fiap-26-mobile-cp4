import React, { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, layout, radius, spacing, type Theme } from '../theme/theme';
import type { PublicProfile } from '../types/user';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export type GroupMemberItemProps = {
  member: PublicProfile;
  isOwner: boolean;
  isMe: boolean;
  onPress: (member: PublicProfile) => void;
  /** Only passed to the group owner, for members other than themselves. */
  onRemove?: (member: PublicProfile) => void;
  removing?: boolean;
};

export const GroupMemberItem: React.FC<GroupMemberItemProps> = ({
  member,
  isOwner,
  isMe,
  onPress,
  onRemove,
  removing = false,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const handlePress = useCallback((): void => onPress(member), [onPress, member]);
  const handleRemove = useCallback((): void => onRemove?.(member), [onRemove, member]);

  // The row and the remove button are siblings: nested buttons are invalid
  // on the web and ambiguous for screen readers.
  return (
    <View style={styles.row}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Ver perfil de ${member.name}${isOwner ? ', proprietário' : ''}`}
        android_ripple={androidRipple(colors.ripple)}
        style={({ pressed }: { pressed: boolean }) => [styles.main, pressed ? styles.pressed : null]}
      >
        <Avatar name={member.name} uid={member.uid} photoUrl={member.photoUrl} size={layout.avatar.md} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {isMe ? `${member.name} (você)` : member.name}
          </Text>
          {isOwner ? (
            <View style={styles.ownerTag}>
              <Text style={styles.ownerText}>Proprietário</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      {onRemove !== undefined ? (
        removing ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Pressable
            onPress={handleRemove}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remover ${member.name} do grupo`}
            style={({ pressed }: { pressed: boolean }) => [styles.remove, pressed ? styles.removePressed : null]}
          >
            <Icon name="close" size={12} color={colors.dangerText} />
            <Text style={styles.removeText}>Remover</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: spacing.md,
    },
    main: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      minHeight: 60,
    },
    pressed: { backgroundColor: colors.surfaceSunken },
    info: { flex: 1, marginLeft: spacing.md, alignItems: 'flex-start' },
    name: { fontSize: 16, fontWeight: '600', color: colors.text },
    ownerTag: {
      marginTop: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySurface,
    },
    ownerText: { fontSize: 11, fontWeight: '700', color: colors.primary },
    remove: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm + spacing.xxs,
      minHeight: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.dangerSurface,
    },
    removePressed: { opacity: 0.7 },
    removeText: { fontSize: 13, fontWeight: '600', color: colors.dangerText },
  });

export default GroupMemberItem;

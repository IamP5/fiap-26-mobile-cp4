import React, { useCallback } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { layout, radius, spacing, type Theme } from '../theme/theme';
import type { PublicProfile } from '../types/user';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export type MemberPickerModalProps = {
  visible: boolean;
  title: string;
  members: readonly PublicProfile[];
  /** Adds an "Todos" row at the top (recipient picker). */
  allowEveryone?: boolean;
  selectedUid?: string | null;
  onSelect: (member: PublicProfile | null) => void;
  onClose: () => void;
};

export const MemberPickerModal: React.FC<MemberPickerModalProps> = ({
  visible,
  title,
  members,
  allowEveryone = false,
  selectedUid = null,
  onSelect,
  onClose,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PublicProfile>) => (
      <Pressable
        onPress={() => onSelect(item)}
        accessibilityRole="button"
        accessibilityLabel={item.name}
        style={({ pressed }: { pressed: boolean }) => [styles.row, pressed ? styles.pressed : null]}
      >
        <Avatar name={item.name} uid={item.uid} photoUrl={item.photoUrl} size={layout.avatar.sm} />
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {selectedUid === item.uid ? <Icon name="check" size={16} color={colors.primary} /> : null}
      </Pressable>
    ),
    [onSelect, selectedUid, styles, colors.primary],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        {allowEveryone ? (
          <Pressable
            onPress={() => onSelect(null)}
            accessibilityRole="button"
            accessibilityLabel="Todos do grupo"
            style={({ pressed }: { pressed: boolean }) => [styles.row, pressed ? styles.pressed : null]}
          >
            <View style={styles.everyone}>
              <Icon name="group" size={18} color={colors.onPrimary} />
            </View>
            <Text style={styles.name}>Todos do grupo</Text>
            {selectedUid === null ? <Icon name="check" size={16} color={colors.primary} /> : null}
          </Pressable>
        ) : null}
        <FlatList
          data={members}
          keyExtractor={(item: PublicProfile) => item.uid}
          renderItem={renderItem}
          style={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum outro integrante no grupo.</Text>}
        />
      </View>
    </Modal>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingTop: spacing.sm,
      maxHeight: '70%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    title: { fontSize: 17, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
    list: { flexGrow: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      minHeight: 52,
    },
    pressed: { backgroundColor: colors.surfaceSunken },
    name: { flex: 1, fontSize: 16, color: colors.text },
    everyone: {
      width: layout.avatar.sm,
      height: layout.avatar.sm,
      borderRadius: layout.avatar.sm / 2,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: { padding: spacing.md, color: colors.muted, textAlign: 'center' },
  });

export default MemberPickerModal;

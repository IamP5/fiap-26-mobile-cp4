import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { radius, spacing, type Theme } from '../theme/theme';
import type { PushPayload } from '../types/notification';
import { Icon } from './Icon';

/** "Sem conexão" strip, driven by the Realtime Database connection state. */
export const OfflineBanner: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.offline, { paddingTop: insets.top + spacing.xs }]} accessibilityRole="alert">
      <Text style={styles.offlineText}>Sem conexão. As mensagens serão sincronizadas quando a internet voltar.</Text>
    </View>
  );
};

export type InAppNotificationProps = {
  payload: PushPayload;
  onPress: (payload: PushPayload) => void;
  onDismiss: () => void;
};

/** A push that arrived with the app open (the OS does not display those). */
export const InAppNotification: React.FC<InAppNotificationProps> = ({ payload, onPress, onDismiss }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.toastWrap, { top: insets.top + spacing.sm }]}>
      <View style={styles.toast}>
        <Pressable
          onPress={() => onPress(payload)}
          accessibilityRole="button"
          accessibilityLabel={`Nova notificação: ${payload.title ?? ''} ${payload.body ?? ''}. Toque para abrir.`}
          style={({ pressed }: { pressed: boolean }) => [styles.toastMain, pressed ? styles.pressed : null]}
        >
          <View style={styles.toastIcon}>
            <Icon name={payload.conversationType === 'group' ? 'group' : 'chat'} size={16} color={colors.onPrimary} />
          </View>
          <View style={styles.toastText}>
            <Text style={styles.toastTitle} numberOfLines={1}>
              {payload.title ?? 'Nova mensagem'}
            </Text>
            {payload.body !== null ? (
              <Text style={styles.toastBody} numberOfLines={1}>
                {payload.body}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar notificação">
          <Icon name="close" size={12} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
};

const createStyles = ({ colors, elevation }: Theme) =>
  StyleSheet.create({
    offline: {
      backgroundColor: colors.dangerSurface,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs,
    },
    offlineText: { fontSize: 12, color: colors.dangerText, textAlign: 'center' },
    toastWrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 50, pointerEvents: 'box-none' },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...elevation.floating,
    },
    toastMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    pressed: { opacity: 0.9 },
    toastIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toastText: { flex: 1 },
    toastTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    toastBody: { marginTop: 1, fontSize: 13, color: colors.muted },
  });

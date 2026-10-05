import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '../theme/ThemeContext';
import { radius, spacing, type Theme } from '../theme/theme';

type Styles = ReturnType<typeof createStyles>;

const LogoMark: React.FC<{ styles: Styles }> = ({ styles }) => (
  <View style={styles.logoTile}>
    <View style={styles.logoBubble}>
      <View style={styles.logoDotsRow}>
        <View style={styles.logoDot} />
        <View style={styles.logoDot} />
        <View style={styles.logoDot} />
      </View>
    </View>
    <View style={styles.logoTail} />
  </View>
);

export type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  compactHeader?: boolean;
};

/** Shared frame of the login and registration screens. */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, footer, compactHeader = false }) => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {compactHeader ? null : <LogoMark styles={styles} />}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.card}>{children}</View>
        {footer}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = ({ colors, elevation }: Theme) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      maxWidth: 480,
      width: '100%',
      alignSelf: 'center',
    },
    header: { alignItems: 'center', marginBottom: spacing.lg },
    logoTile: {
      width: 72,
      height: 72,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
      ...elevation.raised,
    },
    logoBubble: {
      width: 34,
      height: 26,
      borderRadius: radius.md,
      backgroundColor: colors.avatarText,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoDotsRow: { flexDirection: 'row', gap: 4 },
    logoDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
    logoTail: {
      width: 10,
      height: 10,
      backgroundColor: colors.avatarText,
      borderBottomLeftRadius: 2,
      marginTop: -7,
      marginRight: 22,
      transform: [{ rotate: '45deg' }],
    },
    title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: colors.text, textAlign: 'center' },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: 15,
      lineHeight: 21,
      color: colors.muted,
      textAlign: 'center',
      maxWidth: 320,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.md,
      ...elevation.raised,
    },
  });

export default AuthLayout;

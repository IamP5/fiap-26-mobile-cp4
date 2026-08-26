import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '../theme/ThemeContext';
import { radius, spacing, type Theme } from '../theme/theme';

export type EmptyStateVariant = 'messages' | 'contacts' | 'generic';

export type EmptyStateProps = {
  title: string;
  description?: string;
  variant?: EmptyStateVariant;
};

type Styles = ReturnType<typeof createStyles>;

// Decorative, View-only per-variant marks: a chat bubble with dots for
// "messages", two overlapping circles for "contacts", and a plain neutral
// circle for "generic" — never a '?' glyph.
const MessagesMark: React.FC<{ styles: Styles }> = ({ styles }) => (
  <View style={styles.bubbleMark}>
    <View style={styles.bubbleDotsRow}>
      <View style={styles.bubbleDot} />
      <View style={styles.bubbleDot} />
      <View style={styles.bubbleDot} />
    </View>
    <View style={styles.bubbleTail} />
  </View>
);

const ContactsMark: React.FC<{ styles: Styles }> = ({ styles }) => (
  <View style={styles.contactsMark}>
    <View style={[styles.contactCircle, styles.contactCircleBack]} />
    <View style={[styles.contactCircle, styles.contactCircleFront]} />
  </View>
);

const GenericMark: React.FC<{ styles: Styles }> = ({ styles }) => (
  <View style={styles.genericCircle} />
);

const renderMark = (variant: EmptyStateVariant, styles: Styles): React.ReactNode => {
  switch (variant) {
    case 'messages':
      return <MessagesMark styles={styles} />;
    case 'contacts':
      return <ContactsMark styles={styles} />;
    case 'generic':
      return <GenericMark styles={styles} />;
  }
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  variant = 'generic',
}: EmptyStateProps) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <View style={styles.badge}>{renderMark(variant, styles)}</View>
      <Text style={styles.title}>{title}</Text>
      {description !== undefined && description.length > 0 ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
    </View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    badge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    genericCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.muted,
    },
    bubbleMark: {
      width: 30,
      height: 22,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bubbleDotsRow: {
      flexDirection: 'row',
      gap: 3,
    },
    bubbleDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.muted,
    },
    bubbleTail: {
      position: 'absolute',
      bottom: -4,
      left: 8,
      width: 6,
      height: 6,
      borderBottomWidth: 2,
      borderRightWidth: 2,
      borderColor: colors.muted,
      transform: [{ rotate: '45deg' }],
    },
    contactsMark: {
      width: 30,
      height: 22,
      justifyContent: 'center',
    },
    contactCircle: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.muted,
      backgroundColor: colors.surfaceSunken,
    },
    contactCircleBack: {
      left: 0,
    },
    contactCircleFront: {
      left: 10,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    description: {
      marginTop: spacing.sm,
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      textAlign: 'center',
      maxWidth: 320,
    },
  });

export default EmptyState;

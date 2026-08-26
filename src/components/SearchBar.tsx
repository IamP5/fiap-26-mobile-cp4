import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { androidRipple, interaction, maxFontScale, radius, spacing, type Theme } from '../theme/theme';
import { Icon } from './Icon';

export type SearchBarProps = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
};

// Telegram-style search pill: sunken surface, magnifier on the left, and a
// clear affordance that only exists while there is something to clear.
export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = 'Pesquisar',
}: SearchBarProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const handleClear = (): void => {
    onChangeText('');
  };

  return (
    <View style={styles.pill}>
      <Icon name="search" color={colors.muted} size={16} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Pesquisar contatos"
        maxFontSizeMultiplier={maxFontScale.chrome}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel="Limpar pesquisa"
          android_ripple={androidRipple(colors.ripple, true)}
          hitSlop={spacing.sm}
          style={({ pressed }: { pressed: boolean }) => [
            styles.clearButton,
            pressed ? styles.clearPressed : null,
          ]}
        >
          <Icon name="close" color={colors.muted} size={14} />
        </Pressable>
      ) : null}
    </View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 40,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSunken,
      paddingHorizontal: spacing.md - spacing.xs,
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      paddingVertical: spacing.sm,
      fontSize: 16,
      color: colors.text,
    },
    clearButton: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 24,
      height: 24,
      borderRadius: radius.pill,
    },
    clearPressed: {
      opacity: interaction.pressedOpacity,
    },
  });

export default SearchBar;

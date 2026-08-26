import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { layout, radius, spacing, type Theme } from '../theme/theme';

export type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  editable?: boolean;
  error?: string;
  autoFocus?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
};

export const TextField: React.FC<TextFieldProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  editable = true,
  error,
  autoFocus = false,
  returnKeyType,
  onSubmitEditing,
}: TextFieldProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState<boolean>(false);
  const hasError: boolean = error !== undefined && error.length > 0;

  const handleFocus = useCallback((): void => {
    setFocused(true);
  }, []);

  const handleBlur = useCallback((): void => {
    setFocused(false);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          focused ? styles.inputFocused : null,
          hasError ? styles.inputError : null,
          editable ? null : styles.inputDisabled,
        ]}
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable={editable}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        allowFontScaling
        accessibilityLabel={label}
        accessibilityHint={hasError ? error : undefined}
      />
      {hasError ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: {},
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
      marginBottom: spacing.sm,
    },
    input: {
      minHeight: layout.touchTarget,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSunken,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xxs,
      fontSize: 16,
      color: colors.text,
    },
    inputFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceSunken,
    },
    inputError: {
      borderColor: colors.danger,
    },
    inputDisabled: {
      backgroundColor: colors.surface,
      color: colors.muted,
    },
    errorText: {
      marginTop: spacing.xs,
      fontSize: 13,
      color: colors.dangerText,
    },
  });

export default TextField;

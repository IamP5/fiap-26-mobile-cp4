import { Eye, EyeOff } from 'lucide-react-native';
import React, { useState } from 'react';
import { type KeyboardTypeOptions, Pressable, Text, TextInput, type TextInputProps, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { haptics } from '@/lib/haptics';
import { fadeIn, fadeOut, inlineEnter, layout } from '@/lib/motion';
import { isMaterial } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';

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
  /** Muted helper line under the field (hidden while an error shows). */
  hint?: string;
  autoFocus?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
};

/** Field message: fades in while settling down from just under the input. */
const messageEnter = inlineEnter;

/** Label + platform text field + field message. Password fields get a reveal
 * toggle; messages fade in and the field reflows when they appear. */
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
  hint,
  autoFocus = false,
  returnKeyType,
  onSubmitEditing,
}) => {
  const colors = useThemeColors();
  const [focused, setFocused] = useState<boolean>(false);
  const [revealed, setRevealed] = useState<boolean>(false);
  const hasError: boolean = error !== undefined && error.length > 0;

  return (
    <Animated.View layout={layout} className="gap-2">
      <Text
        className={cn(
          'text-sm font-medium',
          isMaterial ? 'text-muted-foreground' : 'text-muted-foreground px-1',
          hasError && 'text-destructive',
        )}
      >
        {label}
      </Text>
      <View>
        <View
          className={cn(
            'flex-row items-center',
            // iOS: a filled rounded field, no outline. Material 3: an outlined
            // field whose border thickens to the accent on focus.
            isMaterial
              ? cn('h-14 rounded-xl border', focused ? 'border-primary border-2' : 'border-input')
              : 'bg-muted h-12 rounded-xl',
            hasError && (isMaterial ? 'border-destructive' : 'border-destructive border'),
            !editable && 'opacity-50',
          )}
        >
          <TextInput
            className={cn('text-foreground h-full flex-1 text-base web:outline-none', isMaterial ? 'px-4' : 'px-3.5')}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            secureTextEntry={secureTextEntry && !revealed}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            editable={editable}
            autoFocus={autoFocus}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            accessibilityLabel={label}
            accessibilityHint={hasError ? error : undefined}
          />
          {secureTextEntry ? (
            <Pressable
              onPress={() => {
                haptics.select();
                setRevealed((v: boolean) => !v);
              }}
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Ocultar senha' : 'Mostrar senha'}
              hitSlop={8}
              className="h-full justify-center px-3 active:opacity-60"
            >
              <Animated.View key={revealed ? 'off' : 'on'} entering={fadeIn}>
                <Icon as={revealed ? EyeOff : Eye} className="text-muted-foreground size-4" />
              </Animated.View>
            </Pressable>
          ) : null}
        </View>
      </View>
      {hasError ? (
        <Animated.Text
          key="error"
          entering={messageEnter}
          exiting={fadeOut}
          className="text-destructive text-[13px] leading-[18px]"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Animated.Text>
      ) : hint !== undefined ? (
        <Animated.Text
          key="hint"
          entering={fadeIn}
          exiting={fadeOut}
          className="text-muted-foreground text-[13px] leading-[18px]"
        >
          {hint}
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
};

export default TextField;

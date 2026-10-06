import { ArrowLeft, ChevronLeft } from 'lucide-react-native';
import React from 'react';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/native/Glass';
import { fadeIn } from '@/lib/motion';
import { isMaterial } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { androidRipple, maxFontScale } from '@/theme/theme';
import { IconButton } from './IconButton';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Avatar of the conversation/profile the screen is about (chat header). */
  leading?: React.ReactNode;
  /** Makes the title block tappable (e.g. open profile / members). */
  onTitlePress?: () => void;
  titleAccessibilityLabel?: string;
  right?: React.ReactNode;
  /**
   * Transparent bar meant to float over scrolling content (iOS chat): only
   * the glass controls are drawn. Ignored on Android, whose app bar is solid.
   */
  floating?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/** Subtitle that crossfades when it changes ("2 integrantes" → "3 integrantes"). */
const Subtitle: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <Animated.View key={text} entering={fadeIn}>
    <Text
      className={cn('text-muted-foreground text-xs', className)}
      numberOfLines={1}
      maxFontSizeMultiplier={maxFontScale.chrome}
    >
      {text}
    </Text>
  </Animated.View>
);

/**
 * Material 3 top app bar (WhatsApp Android): solid surface, arrow-left nav
 * icon, avatar and left-aligned title, ripples instead of highlights.
 */
const MaterialHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  onBack,
  leading,
  onTitlePress,
  titleAccessibilityLabel,
  right,
  onLayout,
}) => {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const hasSubtitle: boolean = subtitle !== undefined && subtitle.length > 0;
  const compact: boolean = leading !== undefined || hasSubtitle;

  const titleBlock = (
    <>
      {leading}
      <View className="flex-1">
        <Text
          className={cn('text-foreground', compact ? 'text-[17px] font-semibold' : 'text-[22px]')}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {hasSubtitle ? <Subtitle text={subtitle ?? ''} className="text-[13px]" /> : null}
      </View>
    </>
  );

  return (
    <View
      onLayout={onLayout}
      className="bg-background z-10 flex-row items-center gap-1 px-1"
      style={{ paddingTop: insets.top, minHeight: insets.top + 64 }}
    >
      {onBack !== undefined ? (
        <IconButton icon={ArrowLeft} onPress={onBack} accessibilityLabel="Voltar" />
      ) : (
        <View className="w-3" />
      )}
      {onTitlePress !== undefined ? (
        <Pressable
          onPress={onTitlePress}
          accessibilityRole="button"
          accessibilityLabel={titleAccessibilityLabel ?? title}
          android_ripple={androidRipple(colors.ripple)}
          className="min-h-12 flex-1 flex-row items-center gap-3 pr-2"
        >
          {titleBlock}
        </Pressable>
      ) : (
        <View className="min-h-12 flex-1 flex-row items-center gap-3 pr-2">{titleBlock}</View>
      )}
      {right !== undefined ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );
};

/**
 * iOS 26 navigation bar: a Liquid Glass back button, a centered title, and —
 * on a conversation (Telegram iOS) — the name in a glass capsule with the
 * avatar as its own round control on the right.
 */
const CupertinoHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  onBack,
  leading,
  onTitlePress,
  titleAccessibilityLabel,
  right,
  onLayout,
}) => {
  const insets = useSafeAreaInsets();
  const hasSubtitle: boolean = subtitle !== undefined && subtitle.length > 0;
  const label: string = titleAccessibilityLabel ?? title;

  const titleText = (
    <>
      <Text
        className="text-foreground text-center text-[16px] font-semibold"
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {hasSubtitle ? <Subtitle text={subtitle ?? ''} className="text-center text-[12px]" /> : null}
    </>
  );

  // Conversation: the title floats in its own capsule, the avatar sits in the
  // trailing slot and opens the same details.
  const center =
    leading !== undefined ? (
      <View className="flex-1 items-center">
        <Glass radius={22} className="h-11 max-w-full">
          <Pressable
            onPress={onTitlePress}
            disabled={onTitlePress === undefined}
            accessibilityRole="button"
            accessibilityLabel={label}
            className="h-11 justify-center px-5 active:opacity-70"
          >
            {titleText}
          </Pressable>
        </Glass>
      </View>
    ) : onTitlePress !== undefined ? (
      <Pressable
        onPress={onTitlePress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="flex-1 items-center active:opacity-60"
      >
        {titleText}
      </Pressable>
    ) : (
      <View className="flex-1 items-center">{titleText}</View>
    );

  const trailing =
    leading !== undefined ? (
      <Pressable
        onPress={onTitlePress}
        disabled={onTitlePress === undefined}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="size-11 items-center justify-center active:opacity-70"
      >
        {leading}
      </Pressable>
    ) : (
      (right ?? null)
    );

  return (
    <View
      onLayout={onLayout}
      // In-flow bars inherit the page color (white or grouped gray), like iOS.
      className="z-10 flex-row items-center gap-2 px-4 pb-2"
      style={{ paddingTop: insets.top + 6 }}
    >
      {/* Fixed-width side slots keep the title optically centered. */}
      <View className="min-w-11 flex-row">
        {onBack !== undefined ? (
          <IconButton icon={ChevronLeft} variant="glass" onPress={onBack} accessibilityLabel="Voltar" />
        ) : null}
      </View>
      {center}
      <View className="min-w-11 flex-row justify-end gap-2">{trailing}</View>
    </View>
  );
};

/** Top bar for pushed screens, in the platform's own idiom. */
export const ScreenHeader: React.FC<ScreenHeaderProps> = (props) =>
  isMaterial ? <MaterialHeader {...props} /> : <CupertinoHeader {...props} />;

export default ScreenHeader;

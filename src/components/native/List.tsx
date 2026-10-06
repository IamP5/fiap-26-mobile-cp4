import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, type PressableProps, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { isMaterial } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { androidRipple } from '@/theme/theme';

/**
 * Settings-style lists in each platform's idiom:
 *  - iOS: inset grouped — white rounded cards on a gray page, colored glyph
 *    tiles, hairlines inset past the tile;
 *  - Android (Material 3): flat rows on the page surface, accent subheaders,
 *    plain outline icons, no cards or separators.
 */

/** Rounded group for form screens that keep their own padding (both platforms). */
export const groupedCardClassName: string = isMaterial
  ? 'bg-muted/70 overflow-hidden rounded-3xl'
  : 'bg-grouped-card overflow-hidden rounded-[26px]';

/** Section caption above a grouped card on a padded form screen. */
export const sectionTitleClassName: string = isMaterial
  ? 'text-primary px-1 text-[14px] font-medium'
  : 'text-muted-foreground px-4 text-[13px] uppercase';

/** Page background a list screen should use. */
export const listPageClassName: string = isMaterial ? 'bg-background' : 'bg-grouped';

export type ListSectionProps = {
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export const ListSection: React.FC<ListSectionProps> = ({ title, footer, children, className }) => (
  <View className={cn(isMaterial ? 'gap-0' : 'gap-1.5', className)}>
    {title !== undefined ? (
      <Text
        className={cn(
          isMaterial
            ? 'text-primary px-4 pb-1 pt-3 text-[14px] font-medium'
            : 'text-muted-foreground px-8 text-[13px] uppercase',
        )}
        accessibilityRole="header"
      >
        {title}
      </Text>
    ) : null}
    <View className={cn(!isMaterial && 'bg-grouped-card mx-4 overflow-hidden rounded-[26px]')}>{children}</View>
    {footer !== undefined ? (
      <View className={cn(isMaterial ? 'px-4 pt-1' : 'px-8')}>
        {typeof footer === 'string' ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px]">{footer}</Text>
        ) : (
          footer
        )}
      </View>
    ) : null}
  </View>
);

/** Hairline between rows (iOS only), inset to line up with the row text. */
export const ListSeparator: React.FC<{ inset?: number }> = ({ inset = 58 }) =>
  isMaterial ? null : <View className="bg-border" style={{ height: StyleSheet.hairlineWidth, marginLeft: inset }} />;

// iOS Settings-style glyph tile colors.
const TILE_COLORS = {
  blue: '#0a84ff',
  green: '#30d158',
  orange: '#ff9f0a',
  red: '#ff453a',
  gray: '#8e8e93',
  purple: '#bf5af2',
  pink: '#ff375f',
  teal: '#40c8e0',
} as const;
export type TileColor = keyof typeof TILE_COLORS;

/** Leading glyph: a colored rounded tile on iOS, a plain 24dp icon on Android. */
export const ListIcon: React.FC<{ icon: LucideIcon; color?: TileColor; destructive?: boolean }> = ({
  icon,
  color = 'gray',
  destructive = false,
}) =>
  isMaterial ? (
    <View className="w-10 items-start justify-center">
      <Icon as={icon} className={cn('size-6', destructive ? 'text-destructive' : 'text-muted-foreground')} />
    </View>
  ) : (
    <View
      className="size-[30px] items-center justify-center rounded-[8px]"
      style={{ backgroundColor: destructive ? TILE_COLORS.red : TILE_COLORS[color] }}
    >
      <Icon as={icon} className="size-[18px] text-white" />
    </View>
  );

export type ListRowProps = Omit<PressableProps, 'children' | 'style'> & {
  icon?: LucideIcon;
  iconColor?: TileColor;
  label: string;
  /** Secondary text: trailing value on iOS, a second line on Android. */
  value?: string;
  /** Replaces the trailing value (a switch, a spinner…). */
  trailing?: React.ReactNode;
  destructive?: boolean;
  /** Center the label (iOS standalone action rows, e.g. "Sair"). */
  centered?: boolean;
  className?: string;
};

export const ListRow: React.FC<ListRowProps> = ({
  icon,
  iconColor,
  label,
  value,
  trailing,
  destructive = false,
  centered = false,
  className,
  onPress,
  disabled,
  ...props
}) => {
  const colors = useThemeColors();
  const interactive: boolean = onPress !== undefined;
  const labelClass: string = cn(
    isMaterial ? 'text-[16px]' : 'text-[17px]',
    destructive ? 'text-destructive' : 'text-foreground',
    centered && !isMaterial && 'text-center',
  );

  const content = isMaterial ? (
    <>
      {icon !== undefined ? <ListIcon icon={icon} destructive={destructive} /> : null}
      <View className="flex-1 justify-center">
        <Text className={labelClass} numberOfLines={1}>
          {label}
        </Text>
        {value !== undefined ? (
          <Text className="text-muted-foreground text-[14px]" numberOfLines={1} selectable={!interactive}>
            {value}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  ) : (
    <>
      {icon !== undefined ? <ListIcon icon={icon} color={iconColor} destructive={destructive} /> : null}
      <Text className={cn(labelClass, centered ? 'flex-1' : 'shrink-0')} numberOfLines={1}>
        {label}
      </Text>
      {value !== undefined ? (
        <Text
          className="text-muted-foreground flex-1 text-right text-[17px]"
          numberOfLines={1}
          selectable={!interactive}
        >
          {value}
        </Text>
      ) : centered ? null : (
        <View className="flex-1" />
      )}
      {trailing}
    </>
  );

  const rowClass: string = cn(
    'flex-row items-center',
    isMaterial ? 'min-h-14 gap-4 px-4 py-2' : 'min-h-[52px] gap-3 px-4 py-2',
    disabled && 'opacity-50',
    className,
  );

  return interactive ? (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      android_ripple={androidRipple(colors.ripple)}
      className={cn(rowClass, 'ios:active:bg-accent web:active:bg-accent')}
      {...props}
    >
      {content}
    </Pressable>
  ) : (
    <View className={rowClass} {...(props as object)}>
      {content}
    </View>
  );
};

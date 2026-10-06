import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, type PressableProps } from 'react-native';

import { PressableScale } from '@/components/motion/PressableScale';
import { Glass } from '@/components/native/Glass';
import { Icon } from '@/components/ui/icon';
import { isMaterial } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { androidRipple } from '@/theme/theme';

export type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  icon: LucideIcon;
  accessibilityLabel: string;
  /**
   * ghost: bare glyph · secondary: muted disc · outline: hairline disc ·
   * primary: filled accent disc · glass: iOS 26 Liquid Glass circle (a plain
   * ripple glyph on Android, where toolbar actions are never boxed).
   */
  variant?: 'ghost' | 'secondary' | 'outline' | 'primary' | 'glass';
  size?: 'sm' | 'md';
  className?: string;
  iconClassName?: string;
};

/** Round icon-only button (header actions, composer controls). */
export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'ghost',
  size = 'md',
  className,
  iconClassName,
  disabled,
  ...props
}) => {
  const colors = useThemeColors();
  // Material toolbar actions: 24dp glyph in a 48dp touch target, borderless ripple.
  const materialToolbar: boolean = isMaterial && (variant === 'ghost' || variant === 'glass');

  if (variant === 'glass' && !isMaterial) {
    return (
      <Glass radius={22} className={cn('size-11', disabled && 'opacity-50', className)}>
        <Pressable
          accessibilityRole="button"
          hitSlop={4}
          disabled={disabled}
          className="size-11 items-center justify-center rounded-full active:opacity-60"
          {...props}
        >
          <Icon as={icon} className={cn('text-foreground size-[22px]', iconClassName)} />
        </Pressable>
      </Glass>
    );
  }

  return (
    <PressableScale
      accessibilityRole="button"
      hitSlop={6}
      activeScale={0.92}
      // Borderless ripples replace the view's background on Android, so only
      // bare glyphs get one; filled discs keep a bounded ripple.
      android_ripple={androidRipple(colors.ripple, variant === 'ghost' || variant === 'glass')}
      disabled={disabled}
      className={cn(
        'items-center justify-center rounded-full',
        materialToolbar ? 'size-12' : size === 'md' ? 'size-10' : 'size-8',
        variant === 'ghost' && 'ios:active:bg-accent web:active:bg-accent',
        variant === 'secondary' && 'bg-secondary active:bg-accent',
        variant === 'outline' && 'border-border bg-background active:bg-accent border',
        variant === 'primary' && 'bg-primary active:opacity-90',
        disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      <Icon
        as={icon}
        className={cn(
          materialToolbar ? 'size-6' : size === 'md' ? 'size-5' : 'size-4',
          variant === 'primary' ? 'text-primary-foreground' : 'text-foreground',
          iconClassName,
        )}
      />
    </PressableScale>
  );
};

export default IconButton;

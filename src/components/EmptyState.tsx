import { Inbox, MessagesSquare, Users, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { sectionEnter } from '@/lib/motion';

export type EmptyStateVariant = 'messages' | 'contacts' | 'generic';

export type EmptyStateProps = {
  title: string;
  description?: string;
  variant?: EmptyStateVariant;
  /** Optional call to action rendered under the copy. */
  action?: React.ReactNode;
};

const ICONS: Record<EmptyStateVariant, LucideIcon> = {
  messages: MessagesSquare,
  contacts: Users,
  generic: Inbox,
};

/**
 * shadcn-style empty state: bordered icon tile, title, muted description and
 * an optional action. Tile, copy and action settle in one after another.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, variant = 'generic', action }) => (
  <View className="flex-1 items-center justify-center px-8 py-12">
    <Animated.View entering={sectionEnter(0)} className="mb-5">
      <View className="border-border bg-card size-14 items-center justify-center rounded-2xl border shadow-sm shadow-black/5">
        <Icon as={ICONS[variant]} className="text-foreground size-6" strokeWidth={1.75} />
      </View>
    </Animated.View>
    <Animated.View entering={sectionEnter(1)} className="items-center">
      <Text className="text-foreground text-center text-base font-semibold tracking-tight">{title}</Text>
      {description !== undefined && description.length > 0 ? (
        <Text className="text-muted-foreground mt-1.5 max-w-xs text-center text-sm leading-5">{description}</Text>
      ) : null}
    </Animated.View>
    {action !== undefined ? (
      <Animated.View entering={sectionEnter(2)} className="mt-6">
        {action}
      </Animated.View>
    ) : null}
  </View>
);

export default EmptyState;

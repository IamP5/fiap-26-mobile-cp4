import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Skeleton } from '@/components/ui/skeleton';
import { listItemEnter } from '@/lib/motion';

export type UserItemSkeletonProps = {
  /** Position in the placeholder list: staggers the entrance and varies line widths. */
  index?: number;
};

// Varying line lengths read as real content rather than a stamped pattern.
const TITLE_WIDTHS: readonly string[] = ['w-2/5', 'w-1/3', 'w-1/2', 'w-1/4', 'w-2/5'];
const LINE_WIDTHS: readonly string[] = ['w-3/4', 'w-2/3', 'w-4/5', 'w-1/2', 'w-3/5'];

/** Placeholder row matching ConversationItem / UserItem geometry (full width). */
export const UserItemSkeleton: React.FC<UserItemSkeletonProps> = ({ index = 0 }) => (
  <Animated.View
    entering={listItemEnter(index)}
    className="flex-row items-center gap-3 px-4 py-3"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
  >
    <Skeleton className="size-[54px] rounded-full" />
    <View className="flex-1 gap-2">
      <View className="flex-row items-center justify-between gap-4">
        <Skeleton className={`h-3.5 rounded-full ${TITLE_WIDTHS[index % TITLE_WIDTHS.length]}`} />
        <Skeleton className="h-2.5 w-8 rounded-full" />
      </View>
      <Skeleton className={`h-3 rounded-full ${LINE_WIDTHS[index % LINE_WIDTHS.length]}`} />
    </View>
  </Animated.View>
);

export default UserItemSkeleton;

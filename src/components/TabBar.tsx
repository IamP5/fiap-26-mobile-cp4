import { MessageCircle } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/native/Glass';
import { Icon } from '@/components/ui/icon';
import { haptics } from '@/lib/haptics';
import { popIn, popOut, spring } from '@/lib/motion';
import { isMaterial } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/theme/ThemeContext';
import { maxFontScale } from '@/theme/theme';
import type { ChatUser } from '@/types/user';
import { Avatar } from './Avatar';

export type HomeTab = 'chats' | 'you';

/** iOS 26 floating capsule. */
const CAPSULE_HEIGHT = 62;
const CAPSULE_TAB_WIDTH = 96;
const CAPSULE_PADDING = 4;
/** Material 3 navigation bar. */
const MATERIAL_BAR_HEIGHT = 80;

const capsuleBottom = (bottomInset: number): number => Math.max(bottomInset - 6, 12);

/**
 * Extra bottom padding a tab screen's scrollable content needs so the last
 * row is not hidden behind the bar.
 */
export const tabBarClearance = (bottomInset: number): number =>
  isMaterial ? bottomInset + MATERIAL_BAR_HEIGHT + 8 : capsuleBottom(bottomInset) + CAPSULE_HEIGHT + 12;

/** Bottom offset for a floating action button sitting above the bar. */
export const tabBarFabOffset = (bottomInset: number): number => tabBarClearance(bottomInset) + 8;

export type TabBarProps = {
  active: HomeTab;
  onChange: (tab: HomeTab) => void;
  me: ChatUser;
  /** Total unread messages across conversations; 0 hides the badge. */
  unreadTotal: number;
};

type TabSpec = { key: HomeTab; label: string; accessibilityLabel: string };

const UnreadBadge: React.FC<{ count: number }> = ({ count }) =>
  count > 0 ? (
    <Animated.View
      entering={popIn}
      exiting={popOut}
      className="bg-destructive absolute -top-1 left-4 h-[18px] min-w-[18px] items-center justify-center rounded-full px-1"
    >
      <Text className="text-[11px] font-semibold tabular-nums text-white" maxFontSizeMultiplier={maxFontScale.chrome}>
        {count > 99 ? '99+' : count}
      </Text>
    </Animated.View>
  ) : null;

const TabGlyph: React.FC<{ tab: HomeTab; selected: boolean; me: ChatUser; unreadTotal: number }> = ({
  tab,
  selected,
  me,
  unreadTotal,
}) =>
  tab === 'chats' ? (
    <View>
      <Icon
        as={MessageCircle}
        strokeWidth={selected ? 2.25 : 2}
        className={cn('size-6', selected ? (isMaterial ? 'text-foreground' : 'text-primary') : 'text-muted-foreground')}
      />
      <UnreadBadge count={unreadTotal} />
    </View>
  ) : (
    <View className={cn('rounded-full border-2 p-px', selected ? 'border-primary' : 'border-transparent')}>
      <Avatar name={me.name} uid={me.uid} photoUrl={me.photoUrl} size={22} />
    </View>
  );

/**
 * Bottom navigation between the conversation list and the user's own space.
 *  - iOS 26: a floating Liquid Glass capsule; a soft lens slides under the
 *    selected tab (critically damped, no bounce).
 *  - Android: a Material 3 navigation bar with the pill indicator behind the
 *    selected icon, ripples on touch.
 */
export const TabBar: React.FC<TabBarProps> = ({ active, onChange, me, unreadTotal }) => {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const unreadHint: string =
    unreadTotal > 0 ? `, ${unreadTotal} ${unreadTotal === 1 ? 'mensagem não lida' : 'mensagens não lidas'}` : '';
  const tabs: readonly TabSpec[] = [
    { key: 'chats', label: 'Conversas', accessibilityLabel: `Conversas${unreadHint}` },
    { key: 'you', label: 'Você', accessibilityLabel: 'Você' },
  ];

  const select = (tab: HomeTab): void => {
    if (tab !== active) {
      haptics.select();
    }
    onChange(tab);
  };

  // iOS lens position (tab index × width), placed without animation the first time.
  const index: number = active === 'chats' ? 0 : 1;
  const lensX = useSharedValue<number>(index * CAPSULE_TAB_WIDTH);
  const placed = useRef<boolean>(false);
  useEffect(() => {
    if (!placed.current) {
      placed.current = true;
      return;
    }
    lensX.value = withSpring(index * CAPSULE_TAB_WIDTH, spring.snappy);
  }, [index, lensX]);
  const lensStyle = useAnimatedStyle(() => ({ transform: [{ translateX: lensX.value }] }));

  if (isMaterial) {
    return (
      <View
        className="bg-muted absolute inset-x-0 bottom-0 flex-row"
        style={{ height: MATERIAL_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }}
        accessibilityRole="tablist"
      >
        {tabs.map((tab: TabSpec) => {
          const selected: boolean = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => select(tab.key)}
              accessibilityRole="tab"
              accessibilityLabel={tab.accessibilityLabel}
              accessibilityState={{ selected }}
              // A borderless ripple sized to the indicator pill, as in M3
              // (borderless is safe here: the tab itself has no background).
              android_ripple={{ color: colors.ripple, borderless: true, radius: 32 }}
              className="flex-1 items-center justify-center gap-1"
            >
              <View
                className={cn('h-8 w-16 items-center justify-center overflow-hidden', selected && 'bg-primary/15')}
                style={{ borderRadius: 16 }}
              >
                <TabGlyph tab={tab.key} selected={selected} me={me} unreadTotal={unreadTotal} />
              </View>
              <Text
                className={cn(
                  'text-xs',
                  selected ? 'text-foreground font-semibold' : 'text-muted-foreground font-medium',
                )}
                maxFontSizeMultiplier={maxFontScale.chrome}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center"
      style={{ bottom: capsuleBottom(insets.bottom) }}
    >
      <Glass
        radius={CAPSULE_HEIGHT / 2}
        className="flex-row shadow-lg shadow-black/10"
        style={{ height: CAPSULE_HEIGHT, padding: CAPSULE_PADDING }}
        accessibilityRole="tablist"
      >
        <Animated.View
          pointerEvents="none"
          className="bg-foreground/10 absolute rounded-full"
          style={[
            {
              top: CAPSULE_PADDING,
              left: CAPSULE_PADDING,
              width: CAPSULE_TAB_WIDTH,
              height: CAPSULE_HEIGHT - CAPSULE_PADDING * 2,
            },
            lensStyle,
          ]}
        />
        {tabs.map((tab: TabSpec) => {
          const selected: boolean = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => select(tab.key)}
              accessibilityRole="tab"
              accessibilityLabel={tab.accessibilityLabel}
              accessibilityState={{ selected }}
              className="items-center justify-center gap-0.5 rounded-full"
              style={{ width: CAPSULE_TAB_WIDTH }}
            >
              <TabGlyph tab={tab.key} selected={selected} me={me} unreadTotal={unreadTotal} />
              <Text
                className={cn('text-[10px] font-semibold', selected ? 'text-primary' : 'text-foreground')}
                maxFontSizeMultiplier={maxFontScale.chrome}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
};

export default TabBar;

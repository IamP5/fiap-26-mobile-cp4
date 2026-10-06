import React from 'react';
import { Text, View } from 'react-native';

import { maxFontScale } from '@/theme/theme';

export type DateSeparatorProps = {
  label: string;
};

// Non-sticky by design: a sticky header fights `inverted` FlatLists (the
// sticky index math is computed against the pre-inversion order), so this
// just renders as a normal row that scrolls with the thread.
export const DateSeparator: React.FC<DateSeparatorProps> = ({ label }) => (
  <View className="my-4 items-center" accessibilityRole="header">
    {/* WhatsApp/Telegram date chip: a soft pill floating on the wallpaper. */}
    <View className="bg-card/90 rounded-full px-3 py-1">
      <Text className="text-muted-foreground text-[12px] font-medium" maxFontSizeMultiplier={maxFontScale.chrome}>
        {label}
      </Text>
    </View>
  </View>
);

export default DateSeparator;

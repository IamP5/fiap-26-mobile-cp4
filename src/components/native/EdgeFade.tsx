import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useThemeColors } from '@/theme/ThemeContext';

export type EdgeFadeProps = {
  height: number;
  /** Which screen edge the fade hangs from. */
  edge?: 'top' | 'bottom';
  /** Color content dissolves into; defaults to the chat wallpaper. */
  color?: string;
  /**
   * Points from the edge kept almost opaque (the area behind a floating bar)
   * before the fade starts, so text never reads through the glass.
   */
  solid?: number;
};

/**
 * iOS 26 "scroll edge effect": content scrolling under floating glass bars
 * softly dissolves into the background instead of colliding with them.
 */
export const EdgeFade: React.FC<EdgeFadeProps> = ({ height, edge = 'top', color, solid }) => {
  const colors = useThemeColors();
  const id = `edge-${useId().replace(/:/g, '')}`;
  const fill: string = color ?? colors.chat;
  const fromTop: boolean = edge === 'top';
  // [offset, opacity] pairs, fading out to transparent at 1. Kept flat:
  // react-native-svg gradients reject Fragment children.
  const stops: ReadonlyArray<readonly [number, number]> =
    solid === undefined
      ? [
          [0, 0.92],
          [0.6, 0.6],
        ]
      : [
          [0, 1],
          [Math.min(Math.max(solid / height, 0.01), 0.95), 0.94],
        ];
  const ramp: ReadonlyArray<readonly [number, number]> = [...stops, [1, 0] as const];
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, height, [fromTop ? 'top' : 'bottom']: 0 }}
    >
      <Svg width="100%" height={height}>
        <Defs>
          {/* Always drawn top-to-bottom (a reversed y1/y2 vector is not
              honoured on iOS); the bottom edge mirrors the stops instead. */}
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {(fromTop ? ramp : [...ramp].reverse().map(([offset, opacity]) => [1 - offset, opacity] as const)).map(
              ([offset, opacity]) => (
                <Stop key={offset} offset={offset} stopColor={fill} stopOpacity={opacity} />
              ),
            )}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={height} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
};

export default EdgeFade;

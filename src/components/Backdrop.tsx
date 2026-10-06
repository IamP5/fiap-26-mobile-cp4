import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Mask, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useThemeColors } from '@/theme/ThemeContext';

export type BackdropProps = {
  /** Dot grid (SpecSync canvas / chat wallpaper). */
  dots?: boolean;
  /** Hairline square grid instead of dots (Vercel-style canvas). */
  grid?: boolean;
  /** Soft accent glow from the top edge. */
  glow?: boolean;
  /** Fade the pattern out radially from the top so it dissolves into the page. */
  fade?: boolean;
  /** Distance between dots / grid lines, in points. */
  gap?: number;
};

/**
 * Decorative full-bleed layer: a dot (or line) grid plus an optional radial
 * accent wash, drawn with SVG so it is resolution-independent and costs one
 * view. Place it as the first child of a relatively positioned container.
 */
export const Backdrop: React.FC<BackdropProps> = ({ dots = true, grid = false, glow = false, fade = false, gap = 18 }) => {
  const colors = useThemeColors();
  const id = useId().replace(/:/g, '');
  const showPattern: boolean = dots || grid;
  const patternId: string = grid ? `grid-${id}` : `dots-${id}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`dots-${id}`} width={gap} height={gap} patternUnits="userSpaceOnUse">
            <Circle cx={gap / 2} cy={gap / 2} r={1} fill={colors.chatPattern} />
          </Pattern>
          <Pattern id={`grid-${id}`} width={gap} height={gap} patternUnits="userSpaceOnUse">
            <Path d={`M ${gap} 0 L 0 0 0 ${gap}`} fill="none" stroke={colors.chatPattern} strokeWidth={1} />
          </Pattern>
          <RadialGradient id={`glow-${id}`} cx="50%" cy="0%" rx="70%" ry="45%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={0.16} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`fade-${id}`} cx="50%" cy="0%" rx="85%" ry="70%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
            <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0.45} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <Mask id={`mask-${id}`}>
            <Rect width="100%" height="100%" fill={`url(#fade-${id})`} />
          </Mask>
        </Defs>
        {showPattern ? (
          <Rect
            width="100%"
            height="100%"
            fill={`url(#${patternId})`}
            mask={fade ? `url(#mask-${id})` : undefined}
          />
        ) : null}
        {glow ? <Rect width="100%" height="100%" fill={`url(#glow-${id})`} /> : null}
      </Svg>
    </View>
  );
};

export default Backdrop;

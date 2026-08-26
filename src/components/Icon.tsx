import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { useThemeColors } from '../theme/ThemeContext';

// Every glyph below is built from plain View primitives (borders + rotation)
// — no unicode glyphs, no emoji, no svg dependency. Sizing is always derived
// from `size` so callers never hardcode pixels.
export type IconName =
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'send'
  | 'check'
  | 'check-double'
  | 'search'
  | 'pending'
  | 'alert'
  | 'close'
  | 'plus'
  | 'chat'
  | 'settings';

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

// A square with two adjacent borders forms a corner; rotating that corner
// points it in a cardinal direction. Unrotated, the left+bottom corner
// points southwest (225deg), so: -45deg -> down, 45deg -> left,
// 135deg -> up, 225deg -> right.
const CORNER_ROTATE: Record<'left' | 'down' | 'right' | 'up', string> = {
  down: '-45deg',
  left: '45deg',
  up: '135deg',
  right: '225deg',
};

const Corner: React.FC<{ direction: 'left' | 'down' | 'right' | 'up'; size: number; color: string; strokeWidth: number }> = ({
  direction,
  size,
  color,
  strokeWidth,
}) => {
  const corner: number = size * 0.5;
  const style: ViewStyle = {
    width: corner,
    height: corner,
    borderLeftWidth: strokeWidth,
    borderBottomWidth: strokeWidth,
    borderColor: color,
    transform: [{ rotate: CORNER_ROTATE[direction] }],
  };
  return <View style={style} />;
};

const renderGlyph = (name: IconName, size: number, color: string, strokeWidth: number): React.ReactNode => {
  switch (name) {
    case 'chevron-left':
      return <Corner direction="left" size={size} color={color} strokeWidth={strokeWidth} />;
    case 'chevron-right':
      return <Corner direction="right" size={size} color={color} strokeWidth={strokeWidth} />;
    case 'chevron-down':
      return <Corner direction="down" size={size} color={color} strokeWidth={strokeWidth} />;
    case 'check': {
      const width: number = Math.max(size * 0.28, 2);
      const height: number = width * 2;
      return (
        <View
          style={{
            width,
            height,
            borderRightWidth: strokeWidth,
            borderBottomWidth: strokeWidth,
            borderColor: color,
            transform: [{ rotate: '45deg' }],
          }}
        />
      );
    }
    case 'check-double': {
      // WhatsApp double tick: two of the same check shape, offset horizontally
      // and clipped inside the box so the pair reads as one glyph.
      const width: number = Math.max(size * 0.28, 2);
      const height: number = width * 2;
      const offset: number = size * 0.22;
      const check: ViewStyle = {
        position: 'absolute',
        width,
        height,
        borderRightWidth: strokeWidth,
        borderBottomWidth: strokeWidth,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
      };
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <View style={[check, { left: size / 2 - width / 2 - offset / 2 }]} />
          <View style={[check, { left: size / 2 - width / 2 + offset / 2 }]} />
        </View>
      );
    }
    case 'search': {
      // Magnifier: a circle ring with a short rotated handle bar anchored at
      // the ring's bottom-right.
      const ringSize: number = size * 0.62;
      const handleLength: number = size * 0.34;
      const handleThickness: number = Math.max(strokeWidth, 2);
      return (
        <View style={{ width: size, height: size }}>
          <View
            style={{
              position: 'absolute',
              top: size * 0.08,
              left: size * 0.08,
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: strokeWidth,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: size * 0.06,
              right: size * 0.1,
              width: handleThickness,
              height: handleLength,
              borderRadius: handleThickness / 2,
              backgroundColor: color,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );
    }
    case 'send': {
      // iMessage-style up arrow: a rounded stem with a chevron head. The
      // chevron is a corner square rotated to point up; its rotated apex lands
      // at the center of its own box, so the box is positioned to put that
      // apex exactly on the stem's top end — one continuous glyph, no
      // floating fragments.
      const stroke: number = Math.max(strokeWidth, size * 0.13);
      const stemTop: number = size * 0.18;
      const stemHeight: number = size * 0.64;
      const head: number = size * 0.5;
      return (
        <View style={{ width: size, height: size, alignItems: 'center' }}>
          <View
            style={{
              position: 'absolute',
              top: stemTop,
              width: stroke,
              height: stemHeight,
              borderRadius: stroke / 2,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: stemTop - head / 2 + stroke / 2,
              width: head,
              height: head,
              borderLeftWidth: stroke,
              borderBottomWidth: stroke,
              borderColor: color,
              transform: [{ rotate: CORNER_ROTATE.up }],
            }}
          />
        </View>
      );
    }
    case 'pending': {
      const ringSize: number = size * 0.78;
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: 1.5,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: strokeWidth,
              height: ringSize * 0.4,
              top: size / 2 - ringSize * 0.4,
              backgroundColor: color,
              borderRadius: strokeWidth / 2,
            }}
          />
        </View>
      );
    }
    case 'alert': {
      const barWidth: number = Math.max(size * 0.16, 2);
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              top: size * 0.12,
              width: barWidth,
              height: size * 0.42,
              borderRadius: barWidth / 2,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: size * 0.14,
              width: barWidth,
              height: barWidth,
              borderRadius: barWidth / 2,
              backgroundColor: color,
            }}
          />
        </View>
      );
    }
    case 'close': {
      const barWidth: number = size * 0.82;
      const barThickness: number = Math.max(strokeWidth, 2);
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: barWidth,
              height: barThickness,
              borderRadius: barThickness / 2,
              backgroundColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: barWidth,
              height: barThickness,
              borderRadius: barThickness / 2,
              backgroundColor: color,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );
    }
    case 'plus': {
      // Same bar geometry as 'close', unrotated: a plus reads as "start new".
      const barWidth: number = size * 0.82;
      const barThickness: number = Math.max(strokeWidth, 2);
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: barWidth,
              height: barThickness,
              borderRadius: barThickness / 2,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: barThickness,
              height: barWidth,
              borderRadius: barThickness / 2,
              backgroundColor: color,
            }}
          />
        </View>
      );
    }
    case 'chat': {
      // Filled speech bubble (tab-bar weight): rounded rectangle with a
      // rotated-square tail tucked under the bottom-left corner.
      const bubbleWidth: number = size * 0.86;
      const bubbleHeight: number = size * 0.68;
      const tail: number = size * 0.26;
      return (
        <View style={{ width: size, height: size }}>
          <View
            style={{
              position: 'absolute',
              top: size * 0.08,
              left: (size - bubbleWidth) / 2,
              width: bubbleWidth,
              height: bubbleHeight,
              borderRadius: size * 0.24,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: size * 0.56,
              left: size * 0.16,
              width: tail,
              height: tail,
              borderRadius: 2,
              backgroundColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );
    }
    case 'settings': {
      // Preference sliders (iOS/Telegram style): three horizontal tracks with
      // a knob dot at a different position on each — reads as "settings"
      // without needing a gear's tooth geometry in plain Views.
      const track: number = Math.max(strokeWidth, 2);
      const knob: number = Math.max(size * 0.3, 6);
      const rows: ReadonlyArray<{ top: number; knobLeft: number }> = [
        { top: size * 0.18, knobLeft: size * 0.55 },
        { top: size * 0.5, knobLeft: size * 0.1 },
        { top: size * 0.82, knobLeft: size * 0.4 },
      ];
      return (
        <View style={{ width: size, height: size }}>
          {rows.map(({ top, knobLeft }) => (
            <React.Fragment key={top}>
              <View
                style={{
                  position: 'absolute',
                  top: top - track / 2,
                  left: 0,
                  right: 0,
                  height: track,
                  borderRadius: track / 2,
                  backgroundColor: color,
                  opacity: 0.55,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  top: top - knob / 2,
                  left: knobLeft,
                  width: knob,
                  height: knob,
                  borderRadius: knob / 2,
                  backgroundColor: color,
                }}
              />
            </React.Fragment>
          ))}
        </View>
      );
    }
    default:
      return null;
  }
};

export const Icon: React.FC<IconProps> = ({ name, size = 20, color, strokeWidth = 2 }: IconProps) => {
  const colors = useThemeColors();
  const resolvedColor: string = color ?? colors.text;
  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      importantForAccessibility="no"
      accessibilityElementsHidden
    >
      {renderGlyph(name, size, resolvedColor, strokeWidth)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});

export default Icon;

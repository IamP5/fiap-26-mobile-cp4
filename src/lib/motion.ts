import { Platform } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  ZoomIn,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

// One motion vocabulary for the whole app, tuned to feel like the platform
// rather than a showcase: Telegram/WhatsApp barely animate content — screens
// push natively, lists simply appear, and only small state changes (a sent
// tick, a badge, a send button) get a short, settled transition. Springs are
// critically damped (no visible bounce) and distances stay within a few
// points. Every Reanimated layout animation respects the OS "reduce motion"
// setting by default.

export const spring = {
  /** Controls: press feedback, toggles, indicators. Critically damped. */
  snappy: { damping: 32, stiffness: 360, mass: 0.7 } satisfies WithSpringConfig,
  /** Content settling (a new bubble). Critically damped. */
  gentle: { damping: 30, stiffness: 240, mass: 0.9 } satisfies WithSpringConfig,
  /** Small controls appearing (send button): the faintest settle, no wobble. */
  pop: { damping: 26, stiffness: 380, mass: 0.6 } satisfies WithSpringConfig,
} as const;

const easeOut = Easing.bezier(0.2, 0, 0, 1);

export const timing = {
  fast: { duration: 120, easing: Easing.out(Easing.quad) } satisfies WithTimingConfig,
  base: { duration: 200, easing: easeOut } satisfies WithTimingConfig,
} as const;

// Reanimated on web only runs *predefined* layout animations with the
// duration / delay / easing modifiers. `springify()` and `withInitialValues()`
// turn a preset into a custom keyframe, and its web cleanup pins the element
// at `position:absolute` with a snapshot size — which wrecks flex layouts. So
// native-only refinements are applied behind this flag.
const isWeb: boolean = Platform.OS === 'web';

/** Lists appear with a short fade on first load only — no cascading stagger. */
export const listItemEnter = (_index: number = 0) => FadeIn.duration(160);

/** Page sections (forms, settings groups): a plain fade, all at once. */
export const sectionEnter = (_index: number = 0) => FadeIn.duration(160);

/** Hero avatars: a plain fade. */
export const heroEnter = FadeIn.duration(200);

/** Inline messages (field errors, hints) appearing under their anchor. */
export const inlineEnter = FadeIn.duration(150);

export const fadeIn = FadeIn.duration(160);
export const fadeOut = FadeOut.duration(120);

/** Banners/toasts sliding a few points down from the top edge. */
export const dropIn = isWeb
  ? FadeIn.duration(200)
  : FadeInUp.duration(220)
      .easing(easeOut)
      .withInitialValues({ transform: [{ translateY: -10 }] });
export const dropOut = FadeOutUp.duration(160);

/** Floating controls (scroll-to-latest) easing up a few points. */
export const riseIn = isWeb
  ? FadeIn.duration(160)
  : FadeInDown.duration(180)
      .easing(easeOut)
      .withInitialValues({ transform: [{ translateY: 6 }] });
export const riseOut = FadeOut.duration(120);

/** Tiny glyphs and badges swapping in: quick fade with a slight scale. */
export const popIn = isWeb
  ? FadeIn.duration(140)
  : ZoomIn.duration(160)
      .easing(easeOut)
      .withInitialValues({ transform: [{ scale: 0.8 }] });
export const popOut = FadeOut.duration(100);

/**
 * Rows reflowing when siblings appear/disappear. Native only: on web,
 * Reanimated's layout transitions snapshot elements into `position:absolute`
 * with measured sizes, and anything measured while hidden (an inactive tab is
 * `display:none`) gets pinned at width 0.
 */
export const layout = isWeb ? undefined : LinearTransition.duration(200).easing(easeOut);

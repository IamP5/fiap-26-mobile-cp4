import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform } from 'react-native';

/**
 * Which native design language the chrome follows:
 *  - cupertino: iOS 26 (Liquid Glass bars and floating controls, Telegram iOS);
 *  - material: Android Material 3 (solid surfaces, ripples, FAB, WhatsApp).
 * Web previews the cupertino layout with a CSS blur standing in for glass.
 */
export type DesignLanguage = 'cupertino' | 'material';

export const design: DesignLanguage = Platform.OS === 'android' ? 'material' : 'cupertino';
export const isMaterial: boolean = design === 'material';
export const isCupertino: boolean = design === 'cupertino';

/**
 * Real Liquid Glass: iOS 26+ binary and runtime API. Some iOS 26 betas lack
 * the API and crash, hence the second check. Older iOS falls back to a
 * translucent material color.
 */
export const hasLiquidGlass: boolean = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

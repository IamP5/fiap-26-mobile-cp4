import { MessageCircle } from 'lucide-react-native';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { sectionEnter } from '@/lib/motion';

export type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  compactHeader?: boolean;
};

/** Shared frame of the login and registration screens, as plain as Telegram's
 * and WhatsApp's: app mark, heading, and the form directly on the page. */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, footer, compactHeader = false }) => {
  const insets = useSafeAreaInsets();
  const offset: number = compactHeader ? 0 : 1;
  return (
    <KeyboardAvoidingView className="bg-background flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerClassName="w-full max-w-md grow justify-center self-center px-6"
        contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-8 items-center">
          {compactHeader ? null : (
            <Animated.View entering={sectionEnter(0)} className="mb-6">
              <View className="bg-primary size-20 items-center justify-center rounded-full">
                <Icon as={MessageCircle} strokeWidth={2} className="size-10 text-white" />
              </View>
            </Animated.View>
          )}
          <Animated.Text
            entering={sectionEnter(offset)}
            className="text-foreground text-center text-[28px] font-bold leading-9"
            accessibilityRole="header"
          >
            {title}
          </Animated.Text>
          <Animated.Text
            entering={sectionEnter(offset + 1)}
            className="text-muted-foreground mt-2 max-w-xs text-center text-[15px] leading-6"
          >
            {subtitle}
          </Animated.Text>
        </View>
        <Animated.View entering={sectionEnter(offset + 2)} className="gap-4">
          {children}
        </Animated.View>
        {footer !== undefined ? <Animated.View entering={sectionEnter(offset + 3)}>{footer}</Animated.View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default AuthLayout;

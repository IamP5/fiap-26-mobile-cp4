import React, { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavigationTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { Loading } from '../components/Loading';
import { InAppNotification, OfflineBanner } from '../components/StatusBanner';
import { DirectoryProvider } from '../contexts/DirectoryContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { useAuth } from '../hooks/useAuth';
import { useConnection } from '../hooks/useConnection';
import { useNotifications } from '../hooks/useNotifications';
import { ChatScreen } from '../screens/ChatScreen';
import { GroupFormScreen } from '../screens/GroupFormScreen';
import { GroupInfoScreen } from '../screens/GroupInfoScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { useThemeContext } from '../theme/ThemeContext';
import type { RootStackParamList } from '../types/navigation';
import { navigationRef } from './navigationRef';

const Stack = createNativeStackNavigator<RootStackParamList>();

const taskAnimation = Platform.OS === 'ios' ? 'slide_from_bottom' : 'default';

/** Overlays that live above every signed-in screen. */
const SessionOverlays: React.FC = () => {
  const connected: boolean = useConnection();
  const { banner, dismissBanner, openConversation } = useNotifications();
  return (
    <>
      {connected ? null : <OfflineBanner />}
      {banner !== null ? (
        // Keyed per message so a new arrival replaces the toast with a fresh drop-in.
        <InAppNotification
          key={`${banner.conversationId}:${banner.title ?? ''}:${banner.body ?? ''}`}
          payload={banner}
          onPress={openConversation}
          onDismiss={dismissBanner}
        />
      ) : null}
    </>
  );
};

export const RootNavigator: React.FC = () => {
  const { user, initializing } = useAuth();
  const { theme, scheme } = useThemeContext();

  const navigationTheme = useMemo<NavigationTheme>(() => {
    const base: NavigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.foreground,
        border: theme.colors.border,
        notification: theme.colors.destructive,
      },
    };
  }, [scheme, theme]);

  if (initializing) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <Loading label="Carregando..." />
      </View>
    );
  }

  const navigator = (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // Each platform's own push: the iOS slide with full-width swipe-back
          // (Telegram/WhatsApp iOS), the system Material transition on Android.
          animation: 'default',
          fullScreenGestureEnabled: true,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {user === null ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            {/* "New chat" / "new group" are tasks, not drill-downs: on iOS they rise from the bottom. */}
            <Stack.Screen name="Users" component={UsersScreen} options={{ animation: taskAnimation }} />
            <Stack.Screen name="GroupForm" component={GroupFormScreen} options={{ animation: taskAnimation }} />
            <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );

  if (user === null) {
    return navigator;
  }

  // Session-scoped providers: keyed by uid, so signing out (or switching
  // accounts) unmounts them and every Firestore/RTDB/FCM listener with them.
  return (
    <DirectoryProvider key={user.uid}>
      <NotificationProvider user={user}>
        <View className="flex-1">
          {navigator}
          <SessionOverlays />
        </View>
      </NotificationProvider>
    </DirectoryProvider>
  );
};

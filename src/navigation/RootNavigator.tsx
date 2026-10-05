import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { useThemeContext, useThemedStyles } from '../theme/ThemeContext';
import type { Theme } from '../theme/theme';
import type { RootStackParamList } from '../types/navigation';
import { navigationRef } from './navigationRef';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Overlays that live above every signed-in screen. */
const SessionOverlays: React.FC = () => {
  const connected: boolean = useConnection();
  const { banner, dismissBanner, openConversation } = useNotifications();
  return (
    <>
      {connected ? null : (
        <View style={overlayStyles.top}>
          <OfflineBanner />
        </View>
      )}
      {banner !== null ? <InAppNotification payload={banner} onPress={openConversation} onDismiss={dismissBanner} /> : null}
    </>
  );
};

export const RootNavigator: React.FC = () => {
  const { user, initializing } = useAuth();
  const { theme, scheme } = useThemeContext();
  const styles = useThemedStyles(createStyles);

  const navigationTheme = useMemo<NavigationTheme>(() => {
    const base: NavigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.separator,
      },
    };
  }, [scheme, theme]);

  if (initializing) {
    return (
      <View style={styles.centered}>
        <Loading label="Carregando..." />
      </View>
    );
  }

  const navigator = (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {user === null ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Users" component={UsersScreen} />
            <Stack.Screen name="GroupForm" component={GroupFormScreen} />
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
        <View style={styles.fill}>
          {navigator}
          <SessionOverlays />
        </View>
      </NotificationProvider>
    </DirectoryProvider>
  );
};

const overlayStyles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' },
});

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  });

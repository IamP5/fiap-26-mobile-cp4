import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorMessage } from './src/components/ErrorMessage';
import { Loading } from './src/components/Loading';
import { TabBar, type HomeTab } from './src/components/TabBar';
import { AuthProvider } from './src/contexts/AuthContext';
import { useAuth } from './src/hooks/useAuth';
import { useChatPreviews } from './src/hooks/useChatPreviews';
import { useContacts } from './src/hooks/useContacts';
import { ChatScreen } from './src/screens/ChatScreen';
import { ConversationsScreen } from './src/screens/ConversationsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ThemeProvider, useThemeContext, useThemedStyles } from './src/theme/ThemeContext';
import { interaction, spacing, type Theme } from './src/theme/theme';
import type { ConversationPreview } from './src/types/chat';
import type { ChatUser } from './src/types/user';

// The sign-out banner used to reserve a fixed 84px slot at all times, which
// snapped a hole into the layout the instant `loading` flipped. It now sizes
// itself to its content and only fades in while busy, native-driver opacity
// only.
const SignOutBanner: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: interaction.duration.banner,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.authBusy, { opacity }]}>
      <Loading compact label="Saindo..." />
    </Animated.View>
  );
};

// Fade-and-rise on mount, used for the auth boundary (login <-> session).
// Keyed by the caller so a swap remounts it and replays the entrance.
const ScreenFade: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const styles = useThemedStyles(createStyles);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: interaction.duration.screen,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <Animated.View
      style={[
        styles.fill,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

/**
 * Hand-rolled push/pop layer state: the pushed screen stays MOUNTED while it
 * slides out (unmounting only when the pop animation finishes), so `mounted`
 * is the mount flag and `progress` (0 = under-layer, 1 = pushed) drives both
 * layers. Chat and the new-chat picker each own one instance.
 */
const usePushLayer = (): {
  mounted: boolean;
  progress: Animated.Value;
  push: () => void;
  pop: () => void;
  reset: () => void;
} => {
  const [mounted, setMounted] = useState<boolean>(false);
  const progress = useRef(new Animated.Value(0)).current;

  const push = useCallback((): void => {
    setMounted(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: interaction.duration.screen,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const pop = useCallback((): void => {
    Animated.timing(progress, {
      toValue: 0,
      duration: interaction.duration.screen,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }: { finished: boolean }) => {
      // An interrupted pop (user re-enters mid-animation) must not unmount
      // the screen that is now pushing back in.
      if (finished) {
        setMounted(false);
      }
    });
  }, [progress]);

  const reset = useCallback((): void => {
    setMounted(false);
    progress.setValue(0);
  }, [progress]);

  return { mounted, progress, push, pop, reset };
};

type SessionNavigatorProps = {
  user: ChatUser;
  authLoading: boolean;
  authError: string | null;
  onSignOut: () => void;
};

/**
 * Everything past the auth boundary. Mounted only while a user is signed in,
 * so all screen/layer state naturally starts fresh on each session.
 *
 * Home is a WhatsApp-style pair of tabs behind a floating bar — "Conversas"
 * (only chats that already have messages) and "Você" (profile + settings).
 * The "+" button pushes the contact picker; picking someone pushes the chat
 * on top and silently retires the picker underneath it.
 */
const SessionNavigator: React.FC<SessionNavigatorProps> = ({
  user,
  authLoading,
  authError,
  onSignOut,
}) => {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<HomeTab>('chats');
  const [chatOther, setChatOther] = useState<ChatUser | null>(null);
  const chatLayer = usePushLayer();
  const newChatLayer = usePushLayer();

  // Contacts + previews live here so the conversation list, the picker and
  // the tab-bar unread badge all share one set of subscriptions.
  const { contacts, loading: contactsLoading, error: contactsError, reload } = useContacts(user);
  const previews: Record<string, ConversationPreview> = useChatPreviews(user, contacts);

  const unreadTotal: number = useMemo(
    () =>
      contacts.reduce((sum: number, contact: ChatUser): number => {
        const preview: ConversationPreview | undefined = previews[contact.uid];
        return preview !== undefined && preview.lastMessage !== null
          ? sum + preview.unreadCount
          : sum;
      }, 0),
    [contacts, previews],
  );

  const handleSelectConversation = useCallback(
    (other: ChatUser): void => {
      setChatOther(other);
      chatLayer.push();
    },
    [chatLayer],
  );

  const handleSelectNewContact = useCallback(
    (other: ChatUser): void => {
      setChatOther(other);
      // The picker retires instantly while the chat slides in over the home
      // list (WhatsApp behavior: dismiss the picker, push the chat), so
      // backing out of the chat always lands on the home tabs. Unmounting at
      // selection time — not via the push animation's end callback — keeps
      // the navigation state deterministic even if the animation is
      // interrupted.
      newChatLayer.reset();
      chatLayer.push();
    },
    [chatLayer, newChatLayer],
  );

  const handleOpenNewChat = useCallback((): void => {
    newChatLayer.push();
  }, [newChatLayer]);

  // Only one push layer is interactable at a time in practice; whichever is
  // mounted (chat wins, it stacks on top) drives the under-layer parallax.
  const activeProgress: Animated.Value | null = chatLayer.mounted
    ? chatLayer.progress
    : newChatLayer.mounted
      ? newChatLayer.progress
      : null;

  return (
    <View style={styles.session}>
      {authLoading ? <SignOutBanner /> : null}
      {authError !== null ? (
        <View style={styles.authError}>
          <ErrorMessage message={authError} onRetry={onSignOut} />
        </View>
      ) : null}
      <View style={styles.sessionBody}>
        {/* Under-layer: home tabs. Both tab screens stay mounted (scroll
            position, search drafts and the name editor survive switching);
            the inactive one is display:none. The floating bar sits inside
            this layer so it parallaxes along with the content. */}
        <Animated.View
          style={[
            styles.fill,
            activeProgress !== null
              ? {
                  opacity: activeProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.55],
                  }),
                  transform: [
                    {
                      translateX: activeProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -width * 0.28],
                      }),
                    },
                  ],
                }
              : null,
          ]}
        >
          <View style={[styles.fill, activeTab === 'chats' ? null : styles.hiddenTab]}>
            <ConversationsScreen
              me={user}
              contacts={contacts}
              loading={contactsLoading}
              error={contactsError}
              reload={reload}
              previews={previews}
              onSelect={handleSelectConversation}
              onNewChat={handleOpenNewChat}
            />
          </View>
          <View style={[styles.fill, activeTab === 'you' ? null : styles.hiddenTab]}>
            <SettingsScreen me={user} onSignOut={onSignOut} />
          </View>
          <TabBar active={activeTab} onChange={setActiveTab} me={user} unreadTotal={unreadTotal} />
        </Animated.View>
        {newChatLayer.mounted ? (
          <Animated.View
            style={[
              styles.pushedLayer,
              {
                transform: [
                  {
                    translateX: newChatLayer.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [width, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <NewChatScreen
              me={user}
              contacts={contacts}
              loading={contactsLoading}
              error={contactsError}
              reload={reload}
              onBack={newChatLayer.pop}
              onSelect={handleSelectNewContact}
            />
          </Animated.View>
        ) : null}
        {chatLayer.mounted && chatOther !== null ? (
          <Animated.View
            style={[
              styles.pushedLayer,
              styles.chatLayer,
              {
                transform: [
                  {
                    translateX: chatLayer.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [width, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <ChatScreen me={user} other={chatOther} onBack={chatLayer.pop} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
};

const RootNavigator: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { user, initializing, loading, error, signOut } = useAuth();

  const handleSignOut = useCallback((): void => {
    // Screen state lives in SessionNavigator, which unmounts only once the
    // user is really cleared: a failed sign-out keeps the current screen and
    // shows the error instead of pretending it worked.
    void signOut();
  }, [signOut]);

  if (initializing) {
    return (
      <View style={styles.centered}>
        <Loading label="Carregando..." />
      </View>
    );
  }

  if (user === null) {
    return (
      <ScreenFade key="login">
        <LoginScreen />
      </ScreenFade>
    );
  }

  return (
    <ScreenFade key="session">
      <SessionNavigator
        user={user}
        authLoading={loading}
        authError={error}
        onSignOut={handleSignOut}
      />
    </ScreenFade>
  );
};

const ThemedRoot: React.FC = () => {
  const { scheme } = useThemeContext();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.root}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </View>
  );
};

const App: React.FC = () => {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedRoot />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

const createStyles = ({ colors, elevation }: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    fill: {
      flex: 1,
    },
    hiddenTab: {
      display: 'none',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    session: {
      flex: 1,
    },
    sessionBody: {
      flex: 1,
    },
    // The pushed card floats above the list with its own edge shadow, so the
    // slide reads as a sheet sliding over — not two views cross-fading.
    pushedLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      ...elevation.floating,
    },
    chatLayer: {
      backgroundColor: colors.chatBackground,
    },
    authBusy: {
      paddingVertical: spacing.xs,
    },
    authError: {
      paddingHorizontal: spacing.md,
    },
  });

export default App;

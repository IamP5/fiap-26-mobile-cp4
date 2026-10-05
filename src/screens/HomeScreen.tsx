import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TabBar, type HomeTab } from '../components/TabBar';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { useThemedStyles } from '../theme/ThemeContext';
import type { Theme } from '../theme/theme';
import type { ConversationSummary } from '../types/chat';
import type { ScreenProps } from '../types/navigation';
import type { ChatUser } from '../types/user';
import { ConversationsScreen } from './ConversationsScreen';
import { SettingsScreen } from './SettingsScreen';

/** Two tabs behind a floating bar: the conversation list and "Você". Both
 * stay mounted so scroll position and drafts survive switching. */
const HomeContent: React.FC<ScreenProps<'Home'> & { me: ChatUser }> = ({ navigation, me }) => {
  const styles = useThemedStyles(createStyles);
  const [tab, setTab] = useState<HomeTab>('chats');
  const { conversations, loading, error, reload, unreadTotal } = useConversations(me);

  const openConversation = useCallback(
    (conversation: ConversationSummary): void => {
      navigation.navigate('Chat', { conversationId: conversation.id, conversationType: conversation.type });
    },
    [navigation],
  );
  const newDirect = useCallback((): void => navigation.navigate('Users', { mode: 'direct' }), [navigation]);
  const newGroup = useCallback((): void => navigation.navigate('GroupForm'), [navigation]);

  return (
    <View style={styles.container}>
      <View style={[styles.fill, tab === 'chats' ? null : styles.hidden]}>
        <ConversationsScreen
          meUid={me.uid}
          conversations={conversations}
          loading={loading}
          error={error}
          reload={reload}
          onOpen={openConversation}
          onNewDirect={newDirect}
          onNewGroup={newGroup}
        />
      </View>
      <View style={[styles.fill, tab === 'you' ? null : styles.hidden]}>
        <SettingsScreen me={me} />
      </View>
      <TabBar active={tab} onChange={setTab} me={me} unreadTotal={unreadTotal} />
    </View>
  );
};

export const HomeScreen: React.FC<ScreenProps<'Home'>> = (props) => {
  const { user } = useAuth();
  return user === null ? null : <HomeContent {...props} me={user} />;
};

const createStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    fill: { flex: 1 },
    hidden: { display: 'none' },
  });

export default HomeScreen;

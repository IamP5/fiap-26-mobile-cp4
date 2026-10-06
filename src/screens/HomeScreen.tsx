import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { TabBar, type HomeTab } from '../components/TabBar';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { cn } from '../lib/utils';
import type { ConversationSummary } from '../types/chat';
import type { ScreenProps } from '../types/navigation';
import type { ChatUser } from '../types/user';
import { ConversationsScreen } from './ConversationsScreen';
import { SettingsScreen } from './SettingsScreen';

/**
 * A tab's content. Stays mounted while hidden (scroll position and drafts
 * survive switching) and swaps instantly, like native tab bars do.
 */
const TabPane: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
  <View className={cn('flex-1', !active && 'hidden')}>{children}</View>
);

/** Two tabs behind a floating bar: the conversation list and "Você". */
const HomeContent: React.FC<ScreenProps<'Home'> & { me: ChatUser }> = ({ navigation, me }) => {
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
    <View className="bg-background flex-1">
      <TabPane active={tab === 'chats'}>
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
      </TabPane>
      <TabPane active={tab === 'you'}>
        <SettingsScreen me={me} />
      </TabPane>
      <TabBar active={tab} onChange={setTab} me={me} unreadTotal={unreadTotal} />
    </View>
  );
};

export const HomeScreen: React.FC<ScreenProps<'Home'>> = (props) => {
  const { user } = useAuth();
  return user === null ? null : <HomeContent {...props} me={user} />;
};

export default HomeScreen;

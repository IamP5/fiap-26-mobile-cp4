import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '../types/navigation';

/** Lets non-screen code (notification taps) navigate. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Conversation currently on screen, so a foreground push for it is not
 * shown again as a banner. */
let activeConversationId: string | null = null;

export const setActiveConversation = (conversationId: string | null): void => {
  activeConversationId = conversationId;
};

export const getActiveConversation = (): string | null => activeConversationId;

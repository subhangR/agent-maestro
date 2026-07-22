// src/features/collab/chat/ — chat vertical barrel.
// Owned by the chat implementer. Do NOT re-export from src/features/collab/index.ts
// (that barrel is owned by the lead). SpaceScreen imports directly from here.
export { ChannelBar, type ChannelBarProps } from './ChannelBar';
export { MessagesPane, type MessagesPaneProps } from './MessagesPane';
export { MessageBubble, PendingBubble, type MessageBubbleProps, type PendingBubbleProps } from './MessageBubble';
export { MessageComposer, type MessageComposerProps } from './MessageComposer';
export { CreateChannelSheet, type CreateChannelSheetProps } from './CreateChannelSheet';

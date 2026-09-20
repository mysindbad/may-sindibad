/** Client-safe AI conversation and message projections. */
export type ClientConversationViewInput = {
  id: string;
  title: string;
  context: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientMessageViewInput = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

export function toClientConversationView(conversation: ClientConversationViewInput) {
  return {
    id: conversation.id,
    title: conversation.title,
    context: conversation.context,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function toClientMessageView(message: ClientMessageViewInput) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

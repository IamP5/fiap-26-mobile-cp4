/**
 * WhatsApp tick ladder for a server-acked outgoing message, derived from the
 * OTHER member's receipt watermarks (see ReceiptMarks in types/chat.ts).
 * Both sides of the comparison are server-aligned timestamps — comparing a
 * local clock against a server watermark is what breaks these apps.
 */
export type TickState = 'sent' | 'delivered' | 'read';

export const deriveTickState = (
  createdAt: number,
  otherDeliveredAt: number,
  otherReadAt: number,
): TickState => {
  if (otherReadAt >= createdAt) {
    return 'read';
  }
  if (otherDeliveredAt >= createdAt) {
    return 'delivered';
  }
  return 'sent';
};

export const TICK_LABELS: Record<TickState, string> = {
  sent: 'enviada',
  delivered: 'entregue',
  read: 'lida',
};

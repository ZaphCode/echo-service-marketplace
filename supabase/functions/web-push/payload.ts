// Contenido de cada push. Sin dependencias de Deno: lo prueban los tests de web/ con Vitest.

export type NotificationRow = {
  id: string;
  user: string;
  message: string;
  type: string;
  request?: string | null;
};

export type MessageRow = {
  id: string;
  request: string;
  sender: string;
  content: string;
};

export type PushMessage = {
  title: string;
  body: string;
  /** Ruta de la SPA; el Service Worker la resuelve contra su scope. */
  url: string;
  /** Avisos con el mismo tag se reemplazan en lugar de apilarse. */
  tag: string;
  /** Pendientes del usuario, para el número del ícono (Badging API). */
  badge: number;
};

const TITLES: Record<string, string> = {
  "PROVIDER:NEW_REQUEST": "Nueva solicitud",
  "PROVIDER:NEW_APPLICATION": "Nueva aplicación",
  "CLIENT:NEW_OFFER": "Nueva propuesta",
  "PROVIDER:NEW_OFFER": "Nueva propuesta",
  "SYSTEM:INFO": "Echo",
};

/** Las notificaciones de la app marcan negritas con *asteriscos*; en el sistema van como texto plano. */
export function plainText(text: string): string {
  return text.replace(/\*/g, "").trim();
}

export function notificationPush(row: NotificationRow, unread: number): PushMessage {
  return {
    title: TITLES[row.type] ?? "Echo",
    body: plainText(row.message),
    url: row.request ? `#/chat/${row.request}` : "#/notificaciones",
    tag: row.request ? `request-${row.request}` : `notification-${row.id}`,
    badge: unread,
  };
}

export function messagePush(row: MessageRow, senderName: string, unread: number): PushMessage {
  const body = row.content.length > 140 ? `${row.content.slice(0, 137)}…` : row.content;
  return {
    title: senderName,
    body,
    url: `#/chat/${row.request}`,
    tag: `chat-${row.request}`,
    badge: unread,
  };
}

/** Un mensaje lleva push al otro participante de la solicitud. */
export function messageRecipient(request: { client: string; provider: string }, sender: string): string {
  return request.client === sender ? request.provider : request.client;
}

/** El recordatorio de un mensaje deja de servir pronto; una propuesta puede esperar un día. */
export const TTL_SECONDS = { message: 60 * 60, notification: 24 * 60 * 60 } as const;

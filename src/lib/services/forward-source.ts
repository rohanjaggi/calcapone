/** Telegram's MessageOrigin, narrowed to the fields we use. */
export type ForwardOrigin = { type: string; [key: string]: unknown };

/**
 * A one-line provenance note for a forwarded message, or null when the origin says nothing
 * useful. Plain text — the caller escapes it.
 */
export function forwardSourceLine(origin: ForwardOrigin | undefined | null): string | null {
  if (!origin || typeof origin !== "object") {
    return null;
  }

  const type = origin.type;
  if (typeof type !== "string") {
    return null;
  }

  let name: string | null = null;
  let url: string | null = null;

  if (type === "channel") {
    name = extractName(origin.title);
    if (name) {
      const username = origin.username;
      const messageId = origin.message_id;
      if (
        typeof username === "string" &&
        username.length > 0 &&
        typeof messageId === "number" &&
        messageId > 0
      ) {
        url = `https://t.me/${username}/${messageId}`;
      }
    }
  } else if (type === "chat") {
    name = extractName(origin.title);
  } else if (type === "user") {
    const firstName = extractName(origin.first_name);
    const lastName = extractName(origin.last_name);
    if (firstName) {
      name = firstName;
      if (lastName) {
        name = `${name} ${lastName}`;
      }
    }
    const username = origin.username;
    if (typeof username === "string" && username.length > 0) {
      name = name ? `${name} @${username}` : `@${username}`;
    }
  } else if (type === "hidden_user") {
    name = extractName(origin.sender_user_name);
  }

  if (!name) {
    return null;
  }

  // Truncate name to 80 characters.
  if (name.length > 80) {
    name = name.slice(0, 77) + "…";
  }

  if (url) {
    return `Forwarded from ${name} — ${url}`;
  }
  return `Forwarded from ${name}`;
}

/** Safely extract a string name, collapsing whitespace and trimming. */
function extractName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  // Collapse whitespace and trim.
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

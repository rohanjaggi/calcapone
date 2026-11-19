/** Typed access to the Telegram Mini App bridge injected by telegram-web-app.js. */
export type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  showConfirm?: (message: string, callback: (confirmed: boolean) => void) => void;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function telegramWebApp(): TelegramWebApp | undefined {
  return typeof window === "undefined" ? undefined : window.Telegram?.WebApp;
}

/**
 * Whether the client running us supports a Bot API version. Outside Telegram the SDK still
 * loads and reports 6.0, and logs a warning for every newer method called on it.
 */
export function telegramSupports(version: string): boolean {
  const app = telegramWebApp();
  return !!app?.initData && !!app.isVersionAtLeast?.(version);
}

/**
 * Open an external URL outside the Mini App.
 *
 * Google refuses OAuth inside embedded webviews, so consent has to happen in the system
 * browser — that's what `openLink` does. Falls back to a normal navigation when the bridge
 * isn't there (local development in a desktop browser).
 */
export function openExternal(url: string): void {
  const webApp = telegramWebApp();
  if (webApp?.openLink) {
    webApp.openLink(url);
    return;
  }
  window.location.href = url;
}

/**
 * A tap of physical feedback for a completed action. Silent outside Telegram and on clients
 * too old to have haptics (the bridge throws on unsupported methods there).
 */
export function haptic(kind: "success" | "warning" | "select" | "light"): void {
  const feedback = telegramWebApp()?.HapticFeedback;
  if (!feedback || !telegramSupports("6.1")) return;
  try {
    if (kind === "select") feedback.selectionChanged();
    else if (kind === "light") feedback.impactOccurred("light");
    else feedback.notificationOccurred(kind);
  } catch {
    // Older clients: no haptics, nothing to do.
  }
}

/**
 * Ask the user to confirm a destructive action, using Telegram's native sheet when the Mini
 * App bridge is present — `window.confirm` renders as a bare browser dialog inside the
 * webview and is blocked outright on some Telegram clients.
 */
export function confirmAction(message: string): Promise<boolean> {
  const webApp = telegramWebApp();
  if (webApp?.showConfirm) {
    return new Promise((resolve) => {
      try {
        webApp.showConfirm!(message, (confirmed) => resolve(confirmed));
      } catch {
        resolve(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}

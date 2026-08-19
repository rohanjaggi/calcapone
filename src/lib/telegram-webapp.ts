/** Typed access to the Telegram Mini App bridge injected by telegram-web-app.js. */
export type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  showConfirm?: (message: string, callback: (confirmed: boolean) => void) => void;
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

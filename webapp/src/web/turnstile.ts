interface TurnstileApi {
  render(el: string, options: Record<string, unknown>): string;
  reset(widget: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * The bot check that must pass before a page can listen. It runs when a video opens, because Chrome only allows
 * the tab-sharing dialog shortly after the click: the token has to be ready by then. Usually invisible.
 */
export class BotCheck {
  private token = "";
  private widget: string | null = null;
  private loading: Promise<void> | null = null;

  prepare(elementId: string): Promise<void> {
    this.loading ??= this.load(elementId).catch(() => {
      this.loading = null; // a later video can try again
    });
    return this.loading;
  }

  private async load(elementId: string): Promise<void> {
    const config = (await (await fetch("/api/config")).json()) as { turnstileSiteKey: string };
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("turnstile"));
      document.head.append(s);
    });
    this.widget = window.turnstile!.render(`#${elementId}`, {
      sitekey: config.turnstileSiteKey,
      appearance: "interaction-only",
      callback: (t: string) => (this.token = t),
      "expired-callback": () => (this.token = ""),
      "error-callback": () => (this.token = ""),
    });
  }

  /** The current token, or "" if the check hasn't finished. Tokens work once, so this also requests the next one. */
  take(): string {
    const t = this.token;
    this.token = "";
    if (t && this.widget !== null) window.turnstile?.reset(this.widget);
    return t;
  }
}

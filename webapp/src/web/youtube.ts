import { VIDEO_ID } from "../types";

/** Video id from a YouTube link (watch, youtu.be, shorts, live, embed) or a bare id. Null if there is none. */
export function parseVideoId(input: string): string | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = url.pathname.split("/");
    id = first === "watch" ? url.searchParams.get("v") : ["shorts", "live", "embed", "v"].includes(first) ? second : null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

interface YTPlayer {
  getCurrentTime(): number;
  getPlayerState(): number;
  seekTo(s: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  cueVideoById(id: string): void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: string, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYING = 1;
let api: Promise<void> | null = null;

function loadApi(): Promise<void> {
  api ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.append(s);
  });
  return api;
}

export class Player {
  private player: YTPlayer | null = null;
  private ready = false;
  private current = "";

  async show(elementId: string, videoId: string): Promise<void> {
    this.current = videoId;
    if (this.player) {
      if (this.ready) this.player.cueVideoById(videoId);
      return;
    }
    await loadApi();
    this.player = new window.YT!.Player(elementId, {
      videoId,
      playerVars: { playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: () => {
          this.ready = true;
          if (this.current !== videoId) this.player?.cueVideoById(this.current);
        },
      },
    });
  }

  clock(): { ms: number; playing: boolean } {
    if (!this.player || !this.ready) return { ms: 0, playing: false };
    return { ms: this.player.getCurrentTime() * 1000, playing: this.player.getPlayerState() === PLAYING };
  }

  seek(ms: number): void {
    this.player?.seekTo(ms / 1000, true);
    this.player?.playVideo();
  }

  play(): void {
    if (this.ready) this.player?.playVideo();
  }
}

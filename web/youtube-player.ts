export interface YouTubePlayer {
  destroy(): void;
  playVideo(): void;
  loadVideoById(options: { videoId: string; startSeconds: number }): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  cueVideoById(options: { videoId: string; startSeconds: number }): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData?(): { title?: string };
}

interface YouTubeApi {
  Player: new (element: HTMLElement, options: {
    videoId?: string;
    playerVars?: Record<string, string | number>;
    events: {
      onReady: (event: { target: YouTubePlayer }) => void;
      onError: (event: { data: number }) => void;
      onStateChange: (event: { data: number }) => void;
      onAutoplayBlocked: () => void;
    };
  }) => YouTubePlayer;
}

type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

let youtubePromise: Promise<YouTubeApi> | undefined;

export function loadYouTube() {
  const browser = window as YouTubeWindow;
  if (browser.YT?.Player) return Promise.resolve(browser.YT);
  youtubePromise ??= new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    const timeout = window.setTimeout(fail, 15_000);
    const previous = browser.onYouTubeIframeAPIReady;
    const ready = () => {
      if (!browser.YT?.Player) return;
      cleanup();
      resolve(browser.YT);
      previous?.();
    };
    function cleanup() {
      window.clearTimeout(timeout);
      if (browser.onYouTubeIframeAPIReady === ready) browser.onYouTubeIframeAPIReady = previous;
    }
    function fail() {
      cleanup();
      script.remove();
      reject(new Error("Could not load the YouTube player."));
    }
    browser.onYouTubeIframeAPIReady = ready;
    script.onerror = fail;
    document.head.append(script);
  }).catch((error: unknown) => {
    youtubePromise = undefined;
    throw error;
  });
  return youtubePromise;
}

export function parseVideoId(value: string) {
  const input = value.trim();
  const validId = (id: string | null | undefined): id is string => !!id && /^[\w-]{11}$/.test(id);
  if (validId(input)) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    const [kind, id] = url.pathname.split("/").filter(Boolean);
    const candidate = url.hostname === "youtu.be"
      ? kind
      : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)
        ? kind === "watch"
          ? url.searchParams.get("v")
          : ["embed", "shorts", "live"].includes(kind ?? "") ? id : undefined
        : undefined;
    if (validId(candidate)) return candidate;
  } catch {
    return undefined;
  }
}


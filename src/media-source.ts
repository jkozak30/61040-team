export type MediaSource = { provider: "youtube"; id: string; title?: string };

export function youtubeSource(videoId: string, title?: string | null): MediaSource {
  const cleaned = title?.trim().slice(0, 200);
  return { provider: "youtube", id: videoId, ...(cleaned ? { title: cleaned } : {}) };
}

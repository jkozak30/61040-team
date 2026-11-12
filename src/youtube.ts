export const lookupYouTubeVideo = async (videoId: string): Promise<string | undefined> => {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  endpoint.searchParams.set("format", "json");

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return undefined;
    const { title } = await response.json() as { title?: unknown };
    return typeof title === "string" ? title.trim() || undefined : undefined;
  } catch {
    return undefined;
  }
};

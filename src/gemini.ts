import type { GenerateSummary } from "./concepts/Summarizing.ts";
import type { Thread } from "./concepts/Discussing.ts";

export const generateDiscussionSummary: GenerateSummary<Thread> = async (items) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Set GEMINI_API_KEY to generate discussion overviews.");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  return requestGeminiSummary(items, key, model);
};

export async function requestGeminiSummary(items: { item: Thread; text: string }[], key: string, model: string,
  fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: [
        "Summarize this study group's discussion to help them find earlier questions and answers.",
        "Use only the supplied messages. Do not claim answers are verified.",
        "Return a short overview and the IDs of threads it references.",
        JSON.stringify(items),
      ].join("\n\n") }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            content: { type: "string" },
            referencedItems: { type: "array", items: { type: "string" } },
          },
          required: ["content", "referencedItems"],
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}.`);
  const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text) throw new Error("Gemini did not return an overview.");
  return JSON.parse(text) as Awaited<ReturnType<GenerateSummary<Thread>>>;
}

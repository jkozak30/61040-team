import { expect, test } from "bun:test";
import { requestGeminiSummary } from "../src/gemini.ts";
import type { Thread } from "../src/concepts/Discussing.ts";

test("the Gemini request includes the discussion and reads its structured overview", async () => {
  let url = "";
  let headers: Headers | undefined;
  let body: any;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    url = String(input);
    headers = new Headers(init?.headers);
    body = JSON.parse(String(init?.body));
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      content: "Return to the pruning question.", referencedItems: ["thread-1"],
    }) }] } }] });
  }) as typeof fetch;
  const result = await requestGeminiSummary(
    [{ item: "thread-1" as Thread, text: "At 1:30: Bob: Why prune?" }],
    "test-key", "gemini-3.5-flash-lite", fetcher,
  );
  expect(url).toEndWith("/models/gemini-3.5-flash-lite:generateContent");
  expect(headers?.get("x-goog-api-key")).toBe("test-key");
  expect(body.generationConfig.responseMimeType).toBe("application/json");
  expect(body.contents[0].parts[0].text).toContain("At 1:30: Bob: Why prune?");
  expect(result).toEqual({ content: "Return to the pruning question.", referencedItems: ["thread-1" as Thread] });
});

test("a provider error does not invent a summary", async () => {
  const fetcher = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
  await expect(requestGeminiSummary([{ item: "thread-1" as Thread, text: "Question" }],
    "test-key", "gemini-3.5-flash-lite", fetcher)).rejects.toThrow("Gemini returned 503.");
});

import Anthropic from "@anthropic-ai/sdk";

export function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });
}

/** Returns flat field map for persistence in `extracted_fields`. Tests mock this. */
export async function extractFieldsFromDocument(input: {
  base64: string;
  mimeType: string;
  docType: string;
}): Promise<Record<string, string | null>> {
  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You extract structured data from a document.
Document type key: ${input.docType}
MIME: ${input.mimeType}
The file content is provided as base64 (${input.base64.length} chars).

Return ONLY a single JSON object mapping field names to string values or null. No markdown.`,
      },
    ],
  });

  const block = res.content.find((b) => b.type === "text");
  const text = block?.type === "text" ? block.text : "{}";
  const match = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : "{}") as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === null || v === undefined) out[k] = null;
      else out[k] = String(v);
    }
    return out;
  }
  return {};
}


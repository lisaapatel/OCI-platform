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
  if (input.docType?.trim() === "photo") {
    return {};
  }
  const client = getAnthropicClient();
  const mediaType = input.mimeType?.trim() || "application/pdf";
  const attachmentBlock =
    mediaType === "application/pdf"
      ? ({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: input.base64,
          },
        } as any)
      : ({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: input.base64,
          },
        } as any);
  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You extract structured data from a document.
Document type key: ${input.docType}
MIME: ${mediaType}

Return ONLY a single JSON object mapping field names to string values or null. No markdown.`,
          },
          attachmentBlock,
        ],
      },
    ],
  });

  const block = res.content.find((b) => b.type === "text");
  const text = block?.type === "text" ? block.text : "{}";
  console.log("Claude raw response text:", text.slice(0, 2000));
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


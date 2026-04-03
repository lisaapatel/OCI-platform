import Anthropic from "@anthropic-ai/sdk";

import {
  CLAUDE_EXTRACTION_KEY_INSTRUCTIONS,
  CLAUDE_PASSPORT_COUNTRY_OF_BIRTH_EXTRA,
} from "@/lib/form-fill-sections";
import { shouldSkipAiExtraction } from "@/lib/oci-new-checklist";

export function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });
}

/** Raw assistant text from Claude (no parsing). Skipped doc types must be handled by the caller. */
export async function callClaudeExtractFieldsRaw(input: {
  base64: string;
  mimeType: string;
  docType: string;
}): Promise<string> {
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
  const passportExtra =
    input.docType === "current_passport" ||
    input.docType === "old_passport" ||
    input.docType === "former_indian_passport"
      ? `\n\n${CLAUDE_PASSPORT_COUNTRY_OF_BIRTH_EXTRA}`
      : "";
  const userPromptText = `You extract structured data from a document.
Document type key: ${input.docType}
MIME: ${mediaType}

${CLAUDE_EXTRACTION_KEY_INSTRUCTIONS}${passportExtra}

Return ONLY a single JSON object mapping field names to string values or null. No markdown.`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPromptText,
          },
          attachmentBlock,
        ],
      },
    ],
  });

  const block = res.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text : "";
}

/** Parse JSON object from Claude text; throws if no valid object. */
export function parseClaudeExtractedFieldsText(
  text: string
): Record<string, string | null> {
  console.log("Claude raw response text:", text.slice(0, 2000));
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new SyntaxError("No JSON object in Claude response");
  }
  const parsed = JSON.parse(match[0]) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyntaxError("Claude response JSON was not an object");
  }
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (v === null || v === undefined) out[k] = null;
    else out[k] = String(v);
  }
  return out;
}

/** Returns flat field map for persistence in `extracted_fields`. Tests mock this. */
export async function extractFieldsFromDocument(input: {
  base64: string;
  mimeType: string;
  docType: string;
}): Promise<Record<string, string | null>> {
  if (shouldSkipAiExtraction(input.docType)) {
    return {};
  }
  const text = await callClaudeExtractFieldsRaw(input);
  return parseClaudeExtractedFieldsText(text);
}

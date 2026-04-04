import Anthropic from "@anthropic-ai/sdk";

import {
  buildProfileExtractionPromptAppendix,
  filterExtractedByProfile,
  getExtractionProfile,
  type PassportRoutingContext,
} from "@/lib/extraction-profiles";
import { mergeMrzOverVision } from "@/lib/passport-mrz-merge";
import { extractMRZ } from "@/lib/mrz-parse";
import { shouldSkipAiExtraction } from "@/lib/oci-new-checklist";

export function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });
}

/** Verbatim text transcription for MRZ discovery (cheap single pass). */
export async function callClaudeTranscribeDocumentText(input: {
  base64: string;
  mimeType: string;
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

  const userPromptText = `Transcribe every visible character on this identity document in rough reading order (top to bottom, page by page).
Include the machine-readable zone (MRZ) lines at the bottom of the passport biodata page exactly as they appear (two lines of 44 characters using A–Z, 0–9, and <).
Output plain text only. No JSON, no markdown, no commentary.`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userPromptText },
          attachmentBlock,
        ],
      },
    ],
  });

  const block = res.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text : "";
}

/** Raw assistant text from Claude (no parsing). Skipped doc types must be handled by the caller. */
export async function callClaudeExtractFieldsRaw(input: {
  base64: string;
  mimeType: string;
  docType: string;
  passportRouting?: PassportRoutingContext;
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
  const profile = getExtractionProfile(
    input.docType,
    input.passportRouting
  );
  const profileBlock = buildProfileExtractionPromptAppendix(
    input.docType,
    profile
  );
  const userPromptText = `You extract structured data from a document.
MIME: ${mediaType}

${profileBlock}

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
  passportRouting?: PassportRoutingContext;
}): Promise<Record<string, string | null>> {
  if (shouldSkipAiExtraction(input.docType)) {
    return {};
  }

  const profile = getExtractionProfile(
    input.docType,
    input.passportRouting
  );

  if (!profile.preferMrzFirst) {
    const text = await callClaudeExtractFieldsRaw(input);
    const parsed = parseClaudeExtractedFieldsText(text);
    return filterExtractedByProfile(parsed, profile);
  }

  let mrzFields: Record<string, string> | null = null;
  try {
    const ocrText = await callClaudeTranscribeDocumentText({
      base64: input.base64,
      mimeType: input.mimeType,
    });
    mrzFields = extractMRZ(ocrText);
  } catch (e) {
    console.warn("MRZ OCR pre-pass failed, using vision only:", e);
  }

  const visionText = await callClaudeExtractFieldsRaw(input);
  const visionParsed = parseClaudeExtractedFieldsText(visionText);
  const merged = mergeMrzOverVision(visionParsed, mrzFields);
  return filterExtractedByProfile(merged, profile);
}

import Anthropic from "@anthropic-ai/sdk";

import {
  CLAUDE_EXTRACTION_KEY_INSTRUCTIONS,
  CLAUDE_PASSPORT_COUNTRY_OF_BIRTH_EXTRA,
} from "@/lib/form-fill-sections";
import { extractMRZ } from "@/lib/mrz-parse";
import { shouldSkipAiExtraction } from "@/lib/oci-new-checklist";

export function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });
}

/** Passport biodata doc types: MRZ pre-pass + extended Claude fields (no MRZ). */
const PASSPORT_MRZ_DOC_TYPES = new Set([
  "current_passport",
  "old_passport",
  "former_indian_passport",
  "parent_passport_father",
  "parent_passport_mother",
]);

const CLAUDE_PASSPORT_VISION_EXTRA = `
Also extract if visible: country_of_birth (place of birth full text as printed — city, state, country), spouse_name (from personal particulars / observation page on Indian passports if present), and address fields address_line1, address_line2, address_city, address_state, address_country (from personal particulars / last page if present). If a field is not visible on the document, omit it — do not guess.
Also use passport_issue_date, passport_issue_place, passport_issue_country (or place_of_issue / country_of_issue) when shown; these are not in the MRZ.
`.trim();

function isPassportMrzDocType(docType: string): boolean {
  return PASSPORT_MRZ_DOC_TYPES.has(docType.trim());
}

function passportPromptExtras(docType: string): string {
  if (!isPassportMrzDocType(docType)) return "";
  return `\n\n${CLAUDE_PASSPORT_COUNTRY_OF_BIRTH_EXTRA}\n\n${CLAUDE_PASSPORT_VISION_EXTRA}`;
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
  const passportExtra = passportPromptExtras(input.docType);
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

const MRZ_OVERLAY_KEYS = new Set([
  "last_name",
  "first_name",
  "passport_number",
  "nationality",
  "date_of_birth",
  "gender",
  "expiry_date",
]);

function mergeMrzOverVision(
  vision: Record<string, string | null>,
  mrz: Record<string, string> | null
): Record<string, string | null> {
  const out: Record<string, string | null> = { ...vision };
  if (!mrz) return out;
  for (const [k, v] of Object.entries(mrz)) {
    const t = v.trim();
    if (!t) continue;
    if (MRZ_OVERLAY_KEYS.has(k)) {
      out[k] = t;
    }
  }
  const exp = out.expiry_date?.trim();
  if (exp) {
    out.passport_expiry_date = exp;
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

  if (!isPassportMrzDocType(input.docType)) {
    const text = await callClaudeExtractFieldsRaw(input);
    return parseClaudeExtractedFieldsText(text);
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
  return mergeMrzOverVision(visionParsed, mrzFields);
}

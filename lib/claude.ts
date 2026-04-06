import Anthropic from "@anthropic-ai/sdk";

import {
  buildProfileExtractionPromptAppendix,
  filterExtractedByProfile,
  getExtractionProfile,
  type PassportRoutingContext,
} from "@/lib/extraction-profiles";
import { extractMrzTextFromDocument } from "@/lib/mrz-image-ocr";
import { mergeMrzOverVision } from "@/lib/passport-mrz-merge";
import { extractMRZ } from "@/lib/mrz-parse";
import { shouldSkipAiExtraction } from "@/lib/oci-new-checklist";
import { preparePdfForExtraction } from "@/lib/pdf-prepare";

export function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });
}

/**
 * Focused MRZ-only extraction. Asks Claude to output ONLY the two 44-char MRZ lines.
 * Used as fallback when sharp can't rasterize PDFs for Tesseract OCR.
 */
async function callClaudeExtractMrzLinesOnly(input: {
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

  const userPromptText = `Find the Machine Readable Zone (MRZ) on the passport photo/biodata page — the page that contains the applicant's photograph.
The MRZ is printed at the very bottom of that page.
It is exactly TWO lines of 44 characters each, using ONLY uppercase letters A-Z, digits 0-9, and the < symbol.
Line 1 starts with P< followed by a 3-letter country code (e.g. P<IND, P<USA).
Line 2 starts with the passport document number.

Output ONLY these two lines, one per line, with no spaces added, no labels, no explanation, no other text.
If you cannot find the MRZ, output nothing.`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 256,
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
  /** MRZ-derived name fields to use as a hint when the biodata page is blurry. */
  mrzHint?: Record<string, string> | null;
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

  // For Indian passports, the biodata page may be blurry. If MRZ was parsed,
  // include the MRZ-derived names as a cross-reference hint.
  let mrzNameHintBlock = "";
  if (profile.id === "indian_passport_core" && input.mrzHint?.first_name) {
    const hintFirst = input.mrzHint.first_name;
    const hintLast = input.mrzHint.last_name ?? "";
    mrzNameHintBlock = `
MRZ cross-reference: The two machine-readable lines at the bottom of the biodata page encode Surname≈"${hintLast}" and Given Names≈"${hintFirst}". Use the printed label values when clearly legible. If the biodata page Given Name(s) field is blurry or illegible, you may use this MRZ-derived given name as the first_name value.`.trimEnd();
  }

  const userPromptText = `You extract structured data from a document.
MIME: ${mediaType}

${profileBlock}${mrzNameHintBlock}

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
  if (
    shouldSkipAiExtraction(input.docType, {
      serviceType: input.passportRouting?.serviceType ?? null,
    })
  ) {
    return {};
  }

  const profile = getExtractionProfile(
    input.docType,
    input.passportRouting
  );

  // Prepare PDF: trim passport docs to first+last page, compress if oversized.
  const preparedBase64 = await preparePdfForExtraction(
    input.base64,
    input.mimeType,
    profile.preferMrzFirst
  );
  const prepared = { ...input, base64: preparedBase64 };

  if (!profile.preferMrzFirst) {
    const text = await callClaudeExtractFieldsRaw(prepared);
    const parsed = parseClaudeExtractedFieldsText(text);
    return filterExtractedByProfile(parsed, profile);
  }

  let mrzFields: Record<string, string> | null = null;
  try {
    const documentBuffer = Buffer.from(preparedBase64, "base64");
    let ocrText = await extractMrzTextFromDocument(
      documentBuffer,
      input.mimeType
    );
    if (!ocrText.trim()) {
      // sharp couldn't rasterize (e.g. PDF without libvips PDF support) — ask Claude for MRZ lines only
      console.log("MRZ OCR returned empty, falling back to Claude MRZ-only extraction");
      ocrText = await callClaudeExtractMrzLinesOnly({
        base64: preparedBase64,
        mimeType: input.mimeType,
      });
    }
    mrzFields = extractMRZ(ocrText);
    console.log("[MRZ] parsed fields:", JSON.stringify(mrzFields));
  } catch (e) {
    console.warn("MRZ pre-pass failed, using vision only:", e);
  }

  const visionText = await callClaudeExtractFieldsRaw({
    ...prepared,
    mrzHint: mrzFields,
  });
  const visionParsed = parseClaudeExtractedFieldsText(visionText);
  const merged = mergeMrzOverVision(visionParsed, mrzFields);
  return filterExtractedByProfile(merged, profile);
}

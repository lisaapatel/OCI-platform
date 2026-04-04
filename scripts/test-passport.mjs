#!/usr/bin/env node
/**
 * Standalone passport extraction test. No Jest, no TypeScript build needed.
 *
 * Usage:
 *   node scripts/test-passport.mjs <file.pdf> <doc_type> [expected_json]
 *
 * Examples:
 *   node scripts/test-passport.mjs father.pdf parent_passport_father '{"first_name":"HARSHAL","last_name":"SHAH"}'
 *   node scripts/test-passport.mjs child.pdf current_passport '{"first_name":"AARIT","last_name":"SHAH"}'
 *
 * doc_type values:
 *   parent_passport_father  → Indian passport (father)
 *   parent_passport_mother  → Indian passport (mother)
 *   current_passport        → Child's US/foreign passport
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { writeFile, readFile, unlink } from "fs/promises";
import Anthropic from "../node_modules/@anthropic-ai/sdk/index.js";
import { parse } from "../node_modules/mrz/lib/index.js";
import { PDFDocument } from "../node_modules/pdf-lib/cjs/index.js";

const execFileAsync = promisify(execFile);
const MAX_BYTES = 20 * 1024 * 1024;

async function extractPassportPages(buffer) {
  const src = await PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true });
  const total = src.getPageCount();
  if (total <= 2) return buffer;
  const out = await PDFDocument.create();
  const [first] = await out.copyPages(src, [0]);
  out.addPage(first);
  if (total - 1 !== 0) {
    const [last] = await out.copyPages(src, [total - 1]);
    out.addPage(last);
  }
  console.log(`  [pdf-prepare] Trimmed ${total} pages → 2 (first + last)`);
  return Buffer.from(await out.save());
}

async function compressWithGs(buffer) {
  const inPath = path.join(tmpdir(), `oci_in_${Date.now()}.pdf`);
  const outPath = path.join(tmpdir(), `oci_out_${Date.now()}.pdf`);
  try {
    await writeFile(inPath, buffer);
    await execFileAsync("gs", ["-sDEVICE=pdfwrite","-dCompatibilityLevel=1.4","-dPDFSETTINGS=/screen","-dNOPAUSE","-dQUIET","-dBATCH",`-sOutputFile=${outPath}`,inPath]);
    return await readFile(outPath);
  } catch { return null; }
  finally { await unlink(inPath).catch(()=>{}); await unlink(outPath).catch(()=>{}); }
}

async function preparePdf(buffer, mimeType, isPassport) {
  if (mimeType !== "application/pdf") return buffer;
  let b = buffer;
  if (isPassport) {
    try { b = await extractPassportPages(b); } catch(e) { console.warn("  [pdf-prepare] page trim failed:", e.message); }
  }
  if (b.length > MAX_BYTES) {
    console.log(`  [pdf-prepare] ${(b.length/1024/1024).toFixed(1)} MB > 20 MB, compressing with gs...`);
    const c = await compressWithGs(b);
    if (c && c.length < b.length) {
      console.log(`  [pdf-prepare] compressed to ${(c.length/1024/1024).toFixed(1)} MB`);
      b = c;
    }
  }
  return b;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(1); }

const [,, filePath, docType = "parent_passport_father", expectedJson] = process.argv;
if (!filePath) {
  console.error("Usage: node scripts/test-passport.mjs <file> <doc_type> ['{\"field\":\"value\"}']");
  process.exit(1);
}

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── MRZ helpers (mirrors lib/mrz-parse.ts) ──────────────────────────────────
function mrzYyMmDdToIso(raw, kind) {
  if (!raw || !/^\d{6}$/.test(raw)) return "";
  const yy = parseInt(raw.slice(0, 2), 10);
  const mm = raw.slice(2, 4);
  const dd = raw.slice(4, 6);
  if (isNaN(yy) || parseInt(mm) < 1 || parseInt(mm) > 12) return "";
  const now = new Date();
  const cy = now.getFullYear() % 100;
  const fullYear = kind === "expiry"
    ? (yy <= cy + 20 ? 2000 + yy : 1900 + yy)
    : (yy > cy ? 1900 + yy : 2000 + yy);
  return `${String(fullYear).padStart(4,"0")}-${mm}-${dd}`;
}

function extractFromMrzLinesDirect(line1, line2) {
  if (line1.length < 44 || line2.length < 44 || line1[0] !== "P") return null;
  const nameSection = line1.slice(5, 44);
  const sepIdx = nameSection.indexOf("<<");
  let surname = "", givenNames = "";
  if (sepIdx >= 0) {
    surname = nameSection.slice(0, sepIdx).replace(/</g, " ").trim();
    givenNames = nameSection.slice(sepIdx + 2).replace(/</g, " ").trim();
  } else {
    const sIdx = nameSection.indexOf("<");
    if (sIdx >= 0) {
      surname = nameSection.slice(0, sIdx).trim();
      givenNames = nameSection.slice(sIdx + 1).replace(/</g, " ").trim();
    }
  }
  const docNumber = line2.slice(0, 9).replace(/</g, "").trim();
  const nationality = line2.slice(10, 13).replace(/</g, "").trim();
  const sex = line2.slice(20, 21);
  const dob = mrzYyMmDdToIso(line2.slice(13, 19), "birth");
  const expiry = mrzYyMmDdToIso(line2.slice(21, 27), "expiry");
  const out = {};
  if (surname) out.last_name = surname;
  if (givenNames) out.first_name = givenNames;
  if (docNumber) out.passport_number = docNumber;
  if (nationality) out.nationality = nationality;
  if (dob) out.date_of_birth = dob;
  if (expiry) out.expiry_date = expiry;
  if (sex === "M" || sex === "F") out.gender = sex;
  return Object.keys(out).length >= 3 ? out : null;
}

function parseMrzFromText(text) {
  const normalized = text.split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/\s+/g, "").toUpperCase());
  const lines44 = [];
  for (const line of normalized) {
    if (/^[A-Z0-9<]{44}$/.test(line)) {
      lines44.push(line);
    } else if (/^[A-Z0-9<]{38,46}$/.test(line)) {
      // ±6 char tolerance — pad with < or trim to 44
      lines44.push(line.slice(0, 44).padEnd(44, "<"));
    } else {
      const matches = line.match(/[A-Z0-9<]{38,}/g);
      if (matches) for (const m of matches) lines44.push(m.slice(0, 44).padEnd(44, "<"));
    }
  }
  console.log(`  [MRZ] lines44 found: ${lines44.length}`, lines44.slice(0,4).map(l => l.slice(0,22)+"..."));

  // Try mrz library first
  for (let i = 0; i + 1 < lines44.length; i++) {
    try {
      const result = parse([lines44[i], lines44[i+1]], { autocorrect: true });
      if (result.valid || (result.fields.documentNumber && result.fields.birthDate && result.fields.lastName)) {
        const f = result.fields;
        const out = {};
        const ln = (f.lastName ?? "").replace(/</g," ").trim();
        const fn = (f.firstName ?? "").replace(/</g," ").trim();
        if (ln) out.last_name = ln;
        if (fn) out.first_name = fn;
        const pn = (f.documentNumber ?? "").replace(/</g,"").trim();
        if (pn) out.passport_number = pn;
        const nat = (f.nationality ?? "").replace(/</g,"").trim();
        if (nat) out.nationality = nat;
        const dob = mrzYyMmDdToIso(f.birthDate, "birth");
        if (dob) out.date_of_birth = dob;
        const exp = mrzYyMmDdToIso(f.expirationDate, "expiry");
        if (exp) out.expiry_date = exp;
        const g = (f.sex ?? "").toLowerCase();
        if (g === "m" || g === "male") out.gender = "M";
        else if (g === "f" || g === "female") out.gender = "F";
        if (Object.keys(out).length > 0) {
          console.log("  [MRZ] parsed via library:", JSON.stringify(out));
          return out;
        }
      }
    } catch {}
  }

  // Direct positional fallback
  const p1 = lines44.find(l => l.startsWith("P"));
  const p1Idx = p1 ? lines44.indexOf(p1) : -1;
  if (p1 && p1Idx >= 0 && p1Idx + 1 < lines44.length) {
    const direct = extractFromMrzLinesDirect(p1, lines44[p1Idx + 1]);
    if (direct) {
      console.log("  [MRZ] parsed via direct fallback:", JSON.stringify(direct));
      return direct;
    }
  }
  console.log("  [MRZ] no parseable MRZ found");
  return null;
}

// ── Extraction prompts (mirrors lib/extraction-profiles.ts) ─────────────────
const INDIAN_INSTRUCTIONS = `
=== STEP 1 — READ NAMES (do this before anything else) ===
Locate the BIODATA PAGE: this is the page that shows the passport holder's PHOTOGRAPH and has exactly two MRZ lines at the very bottom. It may be page 2 or the last page.

On the biodata page:
- Find the label "Surname" → copy its value as last_name. This is the family name — a short single word (SHAH, PARIKH, KUMAR, PATEL).
- Find the label "Given Name(s)" or "Given Names" → copy its value as first_name. If two words (e.g. "HARSHAL PRAVINBHAI"), the FIRST word is first_name and the SECOND is middle_name.
- DO NOT use any text from any other page for first_name or last_name.
- WRONG: taking the second word of Given Name(s) as last_name. NEVER do this.
- RIGHT: Surname=SHAH, Given Name(s)=HARSHAL PRAVINBHAI → last_name="SHAH", first_name="HARSHAL", middle_name="PRAVINBHAI".

=== STEP 2 — OTHER PAGES ===
- "Name of Father" → father_full_name only.
- "Name of Mother" → mother_full_name only.
- "MADHYA PRADESH", "MAHARASHTRA", "GUJARAT" etc. are Indian states — never output as first_name.
- passport_issue_date is always EARLIER than passport_expiry_date.
`.trim();

const FOREIGN_INSTRUCTIONS = `
Passport biodata page only. Match values to their PRINTED FIELD LABELS, not by position or order on the page.

NAME FIELD RULES (critical — do not get these backwards):
- The label "Surname" (or "Last Name") printed on the passport → output its value as last_name. This is the family name (e.g. SHAH, PATEL, KUMAR).
- The label "Given Name(s)" (or "Given Names") printed on the passport → output its value as first_name (and middle_name if two words).
- Surname appears before Given Names on US passports — do NOT assign the first name-value you see to first_name. Assign by LABEL.
- WRONG example: first_name="SHAH", last_name="AARIT HARSHAL" — this is backwards.
- RIGHT example: Surname=SHAH, Given Names=AARIT HARSHAL → last_name="SHAH", first_name="AARIT", middle_name="HARSHAL".
- last_name is a short single word (SHAH, PATEL). first_name is one or more given names (AARIT, AARIT HARSHAL).

DATE RULES:
- passport_issue_date is always EARLIER than passport_expiry_date.
- date_of_birth is under the "Date of Birth" label — do not confuse with issue or expiry dates.
`.trim();

const INDIAN_FIELDS = ["first_name","last_name","full_name","surname","given_name","date_of_birth","place_of_birth","country_of_birth","gender","nationality","passport_number","passport_no","passport_issue_date","passport_expiry_date","expiry_date","passport_issue_place","middle_name","spouse_name","address_line1","address_line2","city","state_province","postal_code","father_full_name","mother_full_name"];
const FOREIGN_FIELDS = ["first_name","last_name","full_name","surname","given_name","date_of_birth","place_of_birth","country_of_birth","gender","nationality","passport_number","passport_no","passport_issue_date","passport_expiry_date","expiry_date","passport_issue_place","passport_issue_country","middle_name","city","state_province","postal_code","country"];

// ── API helpers ──────────────────────────────────────────────────────────────
async function claudeMrzOnly(base64, mimeType) {
  const attachment = mimeType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };
  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 256,
    messages: [{ role: "user", content: [
      { type: "text", text: `Find the Machine Readable Zone (MRZ) on the passport photo/biodata page — the page with the applicant's photograph.
The MRZ is at the very bottom of that page.
It is exactly TWO lines of 44 characters each, using ONLY uppercase letters A-Z, digits 0-9, and the < symbol.
Line 1 starts with P< followed by a 3-letter country code (e.g. P<IND, P<USA).
Line 2 starts with the passport document number.
Output ONLY these two lines, one per line, with no spaces added, no labels, no explanation, no other text.
If you cannot find the MRZ, output nothing.` },
      attachment,
    ]}],
  });
  const block = res.content.find(b => b.type === "text");
  return block?.text ?? "";
}

async function claudeVision(base64, mimeType, docType, mrzHint = null) {
  const isIndian = docType === "parent_passport_father" || docType === "parent_passport_mother" || docType === "former_indian_passport";
  const instructions = isIndian ? INDIAN_INSTRUCTIONS : FOREIGN_INSTRUCTIONS;
  const fields = isIndian ? INDIAN_FIELDS : FOREIGN_FIELDS;
  const attachment = mimeType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };

  let mrzNameHintBlock = "";
  if (isIndian && mrzHint?.first_name) {
    mrzNameHintBlock = `\nMRZ cross-reference: The two machine-readable lines at the bottom of the biodata page encode Surname≈"${mrzHint.last_name ?? ""}" and Given Names≈"${mrzHint.first_name}". Use the printed label values when clearly legible. If the biodata page Given Name(s) field is blurry or illegible, you may use this MRZ-derived given name as the first_name value.`;
  }

  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: [
      { type: "text", text: `You extract structured data from a document.
MIME: ${mimeType}

${instructions}

Extract data from this document. Document type key: ${docType}

Strict output rules:
- Return ONE JSON object; snake_case keys only.
- Include ONLY these keys (each value a string or null): ${fields.join(", ")}
- Set a value only when it is clearly printed on this document. If absent, illegible, or uncertain, use null.
- Do not infer, guess, or fill from context.${mrzNameHintBlock}` },
      attachment,
    ]}],
  });
  const block = res.content.find(b => b.type === "text");
  return block?.text ?? "";
}

// ── Main ─────────────────────────────────────────────────────────────────────
const absPath = path.resolve(filePath);
if (!fs.existsSync(absPath)) { console.error(`File not found: ${absPath}`); process.exit(1); }

const rawBuffer = fs.readFileSync(absPath);
const ext = path.extname(absPath).toLowerCase();
const mimeType = ext === ".pdf" ? "application/pdf"
  : ext === ".png" ? "image/png"
  : "image/jpeg";

const isPassport = ["parent_passport_father","parent_passport_mother","parent_passport",
  "current_passport","former_indian_passport","old_passport"].includes(docType);
const buffer = await preparePdf(rawBuffer, mimeType, isPassport);
const base64 = buffer.toString("base64");

console.log(`\nFile:     ${absPath}`);
console.log(`Size:     ${(rawBuffer.length / 1024).toFixed(1)} KB → ${(buffer.length / 1024).toFixed(1)} KB (prepared)`);
console.log(`doc_type: ${docType}\n`);

// Step 1: MRZ extraction
console.log("── Step 1: MRZ extraction ──────────────────────────");
const mrzText = await claudeMrzOnly(base64, mimeType);
console.log("  Raw MRZ text from Claude:", JSON.stringify(mrzText.slice(0, 200)));
const mrzFields = parseMrzFromText(mrzText);

// Step 2: Vision extraction
console.log("\n── Step 2: Vision extraction ───────────────────────");
const visionRaw = await claudeVision(base64, mimeType, docType, mrzFields);
const visionMatch = visionRaw.match(/\{[\s\S]*\}/);
const vision = visionMatch ? JSON.parse(visionMatch[0]) : {};
console.log("  Vision result (non-null fields):");
for (const [k, v] of Object.entries(vision)) if (v !== null) console.log(`    ${k}: ${v}`);

// Step 3: Merge
console.log("\n── Step 3: Merged result ───────────────────────────");
const merged = { ...vision };
if (mrzFields) {
  // Sanity check: if MRZ last_name disagrees with vision last_name, MRZ is hallucinated — skip all overrides
  const mrzLastName = (mrzFields.last_name ?? "").trim().toUpperCase();
  const visionLastName = (vision.last_name ?? "").trim().toUpperCase();
  if (mrzLastName && visionLastName && mrzLastName !== visionLastName) {
    console.log(`  [Merge] MRZ last_name "${mrzLastName}" ≠ vision "${visionLastName}" — MRZ hallucinated, no overrides applied`);
  } else {
    // MRZ transcription is reliable for dates/passport number, but not names.
    const MRZ_SAFE_KEYS = new Set(["date_of_birth","expiry_date","passport_number","nationality","gender"]);
    for (const [k, v] of Object.entries(mrzFields)) {
      if (!MRZ_SAFE_KEYS.has(k) || !v) continue;
      // For expiry_date: only override if MRZ year is within 2 years of vision expiry year
      if (k === "expiry_date") {
        const visionExpStr = (vision.expiry_date ?? vision.passport_expiry_date ?? "").trim();
        const mrzYear = /^(\d{4})/.exec(v)?.[1];
        const visionYear = /(\d{4})/.exec(visionExpStr)?.[1];
        if (mrzYear && visionYear && Math.abs(Number(mrzYear) - Number(visionYear)) > 2) {
          console.log(`  [Merge] MRZ expiry year ${mrzYear} ≠ vision year ${visionYear} — keeping vision expiry`);
          continue;
        }
      }
      merged[k] = v;
      if (k === "expiry_date") merged.passport_expiry_date = v;
    }
    // Guard: clear past expiry (MRZ read error on blurry scans)
    const expRaw = (merged.expiry_date ?? "").trim();
    const expM = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expRaw);
    if (expM && Number.parseInt(expM[1]) < new Date().getFullYear()) {
      console.log(`  [Merge] expiry_date ${expRaw} is past — clearing MRZ expiry override`);
      merged.expiry_date = vision.expiry_date ?? null;
      merged.passport_expiry_date = vision.passport_expiry_date ?? vision.expiry_date ?? null;
    }
    console.log("  [Merge] merged non-null overrides: DOB=", merged.date_of_birth, "exp=", merged.expiry_date, "pn=", merged.passport_number);
  }
}

for (const [k, v] of Object.entries(merged)) if (v !== null) console.log(`  ${k}: ${v}`);

// Step 4: Compare expected
if (expectedJson) {
  console.log("\n── Assertions ──────────────────────────────────────");
  const expected = JSON.parse(expectedJson);
  let passed = 0, failed = 0;
  for (const [field, exp] of Object.entries(expected)) {
    const got = String(merged[field] ?? "").toLowerCase();
    const ok = got.includes(exp.toLowerCase()) || exp.toLowerCase().includes(got);
    if (ok) { console.log(`  ✓ ${field}: "${merged[field]}"`); passed++; }
    else { console.log(`  ✗ ${field}: got "${merged[field]}", expected "${exp}"`); failed++; }
  }
  console.log(`\n${passed}/${passed+failed} fields correct`);
  if (failed > 0) process.exit(1);
}

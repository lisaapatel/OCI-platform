/**
 * @jest-environment jsdom
 */

jest.mock("@/lib/supabase", () => ({
  supabase: { from: jest.fn() },
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({ refresh: jest.fn() })),
}));

jest.mock("next/link", () => {
  const React = require("react");
  return function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  FORM_FILL_ALL_FIELDS,
  PASSPORT_RENEWAL_FORM_FILL_BLOCKS,
} from "@/lib/form-fill-sections";
import type { ExtractedField } from "@/lib/types";

const allPrimaryKeys = FORM_FILL_ALL_FIELDS.map((f) => f.keys[0]);

function buildFields(
  overrides: Record<string, Partial<{ value: string; flagged: boolean; note: string }>> = {}
) {
  return allPrimaryKeys.map((field_name) => {
    const o = overrides[field_name] ?? {};
    const value = o.value ?? "Sample value";
    return {
      id: `id-${field_name}`,
      application_id: "app-1",
      field_name,
      field_value: value,
      source_doc_type: "current_passport",
      is_flagged: o.flagged ?? false,
      flag_note: o.note ?? "",
      reviewed_by: "",
      reviewed_at: "",
    };
  });
}

const defaultPortalReadiness = {
  required_docs_complete: true,
  checklist_pdfs_ready: true,
  checklist_pdfs_ok: 5,
  checklist_pdfs_uploaded: 5,
  applicant_photo_valid: true as boolean | null,
  applicant_signature_valid: null as boolean | null,
  all_portal_green: true,
  oci_parent_doc_for_submission: true,
  uploaded_doc_types: ["parent_passport"] as string[],
};

const defaultProps = {
  applicationId: "app-1",
  appNumber: "APP-0001",
  customerName: "Priya Sharma",
  customerEmail: "priya@example.com",
  customerPhone: "555-0100",
  lastReviewedLabel: "Mar 15, 2026 · 2:30 PM",
  portalReadiness: defaultPortalReadiness,
};

function buildRenewalFields(
  overrides: Record<
    string,
    Partial<{ value: string; flagged: boolean; note: string }>
  > = {},
): ExtractedField[] {
  const rows: ExtractedField[] = [];
  let i = 0;
  for (const block of PASSPORT_RENEWAL_FORM_FILL_BLOCKS) {
    for (const def of block.fields) {
      if (def.displayOnly || def.referenceOnly) continue;
      const key = def.keys[0];
      const o = overrides[key] ?? {};
      const value = o.value ?? "Renewal";
      let sourceDocType = "current_passport";
      if (block.id === "renewal_present_address") {
        sourceDocType = "us_address_proof";
      } else if (block.id === "renewal_indian_address") {
        sourceDocType = "indian_address_proof";
      }
      rows.push({
        id: `renewal-${i++}`,
        application_id: "app-1",
        field_name: key,
        field_value: value,
        source_doc_type: sourceDocType,
        is_flagged: o.flagged ?? false,
        flag_note: o.note ?? "",
        reviewed_by: "",
        reviewed_at: "",
      });
    }
  }
  return rows;
}

describe("Form fill page", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  test("Test 1: Govt portal section headings render", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient {...defaultProps} initialFields={buildFields()} />
    );

    expect(
      screen.getByRole("heading", { name: /SECTION 1 — Place of Submission/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /SECTION 2 — Personal Details/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /SECTION 3 — Current Passport \(Foreign\)/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /SECTION 4 — Former Indian Passport/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /SECTION 5 — Present Address/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /SECTION 6 — Permanent Address/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /SECTION 7 — Parent \/ Spouse Details/i,
      })
    ).toBeInTheDocument();
  });

  test("Test 2: Extracted values show in large readable inputs", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient {...defaultProps} initialFields={buildFields()} />
    );

    const first = screen.getAllByDisplayValue("Sample value")[0];
    expect(first.tagName).toBe("INPUT");
    expect(
      first.className.includes("text-lg") ||
        first.className.includes("text-xl")
    ).toBe(true);
  });

  test("Test 3: Copy copies field value to clipboard", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient {...defaultProps} initialFields={buildFields()} />
    );

    const copyBtn = screen.getAllByRole("button", { name: /^copy$/i })[0];
    await userEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  test("Test 4: Manual flagged fields show amber banner with flag note", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const fields = buildFields({
      full_name: { value: "X", flagged: true, note: "Verify spelling" },
    });
    render(<FormFillPageClient {...defaultProps} initialFields={fields} />);

    const banner = screen.getByText(/Verify spelling/i);
    expect(banner.closest(".bg-amber-50")).toBeTruthy();
    expect(screen.getByText(/Flagged \(review\):/i)).toBeInTheDocument();
  });

  test("Test 4b: AUTO_RECON flag notes are hidden on fill page", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const fields = buildFields({
      full_name: {
        value: "X",
        flagged: true,
        note: "AUTO_RECON:conflict|passport vs birth cert",
      },
    });
    render(<FormFillPageClient {...defaultProps} initialFields={fields} />);

    expect(screen.queryByText(/AUTO_RECON/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Flagged \(review\):/i)).not.toBeInTheDocument();
  });

  test("Test 5: Empty extracted fields show manual-entry hint", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const fields = buildFields({
      last_name: { value: "" },
      date_of_birth: { value: "   " },
    });
    render(<FormFillPageClient {...defaultProps} initialFields={fields} />);

    const hints = screen.getAllByText(/No auto data — enter manually/i);
    expect(hints.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Fill manually/i)).not.toBeInTheDocument();
  });

  test("Test 6: Progress uses visible field count and manual banner when needed", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient {...defaultProps} initialFields={buildFields()} />
    );

    expect(screen.getByTestId("form-fill-progress")).toHaveTextContent(
      /of \d+ fields have values/
    );
    expect(screen.getByTestId("form-fill-manual-banner")).toBeInTheDocument();
    expect(screen.getByTestId("form-fill-summary")).toHaveTextContent(
      "Last reviewed"
    );
  });

  test("Test 6b: Married shows spouse rows; unmarried does not", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const unmarried = buildFields({
      marital_status: { value: "Unmarried" },
    });
    const { rerender } = render(
      <FormFillPageClient {...defaultProps} initialFields={unmarried} />
    );

    expect(
      screen.queryByRole("textbox", { name: /^Spouse name$/i })
    ).not.toBeInTheDocument();

    const married = buildFields({
      marital_status: { value: "Married" },
    });
    rerender(<FormFillPageClient {...defaultProps} initialFields={married} />);

    expect(
      screen.getByRole("textbox", { name: /^Spouse name$/i })
    ).toBeInTheDocument();
  });

  test("Test 7: Print styles hide chrome", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const { container } = render(
      <>
        <style>{`
          @media print {
            .no-print { display: none !important; }
          }
        `}</style>
        <FormFillPageClient {...defaultProps} initialFields={buildFields()} />
      </>
    );

    const copyButtons = screen.getAllByRole("button", { name: /^copy$/i });
    copyButtons.forEach((btn) => expect(btn).toHaveClass("no-print"));
    expect(
      screen.getByRole("button", { name: /Print this page/i })
    ).toHaveClass("no-print");
    expect(container.querySelector("style")?.textContent).toMatch(/@media print/);
    expect(container.querySelector("style")?.textContent).toMatch(/\.no-print/);
  });

  test("Test 8: Header shows app number, customer, Back link", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient {...defaultProps} initialFields={buildFields()} />
    );

    expect(screen.getByText("APP-0001")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByTestId("form-fill-detection-banner")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /Back to Review/i });
    expect(back).toHaveAttribute("href", "/applications/app-1/review");
  });
});

describe("Passport renewal fill page", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  const renewalProps = {
    ...defaultProps,
    serviceType: "passport_renewal" as const,
  };

  test("Renewal: portal section headings render", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient
        {...renewalProps}
        initialFields={buildRenewalFields()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /SECTION 1 — Personal Details/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /SECTION 2 — Current Indian Passport/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /SECTION 3 — Family/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /SECTION 4 — Present Address \(USA\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /SECTION 5 — Indian Address/i }),
    ).toBeInTheDocument();
  });

  test("Renewal: Copy copies field value to clipboard", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient
        {...renewalProps}
        initialFields={buildRenewalFields()}
      />,
    );

    const copyBtn = screen.getAllByRole("button", { name: /^copy$/i })[0];
    await userEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  test("Renewal: Hide empty filters out empty rows", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const fields = buildRenewalFields({
      first_name: { value: "Filled" },
      middle_name: { value: "" },
    });
    render(<FormFillPageClient {...renewalProps} initialFields={fields} />);

    await userEvent.click(screen.getByRole("button", { name: /^Hide empty$/i }));

    expect(
      screen.getByRole("textbox", { name: /^First name$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /^Middle name$/i }),
    ).not.toBeInTheDocument();
  });
});

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

import { FORM_FILL_ALL_FIELDS } from "@/lib/form-fill-sections";

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
      screen.getByRole("heading", { name: /SECTION 3 — Passport Details/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /SECTION 4 — Family Details/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /SECTION 5 — Occupation & Address/i })
    ).toBeInTheDocument();
  });

  test("Test 2: Extracted values use large readable text", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient {...defaultProps} initialFields={buildFields()} />
    );

    const valueEls = screen.getAllByText("Sample value");
    expect(
      valueEls[0].className.includes("text-lg") ||
        valueEls[0].className.includes("text-xl")
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

  test("Test 4: Flagged fields show red banner with flag note", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const fields = buildFields({
      first_name: { value: "X", flagged: true, note: "Verify spelling" },
    });
    render(<FormFillPageClient {...defaultProps} initialFields={fields} />);

    const banner = screen.getByText(/Verify spelling/i);
    expect(banner.closest(".bg-red-50")).toBeTruthy();
    expect(screen.getByText(/Flagged:/i)).toBeInTheDocument();
  });

  test("Test 5: Empty extracted fields show Fill manually badge", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const fields = buildFields({
      last_name: { value: "" },
      date_of_birth: { value: "   " },
    });
    render(<FormFillPageClient {...defaultProps} initialFields={fields} />);

    const badges = screen.getAllByText(/Fill manually/i);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  test("Test 6: Progress shows X of 25 and manual banner when needed", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient {...defaultProps} initialFields={buildFields()} />
    );

    expect(screen.getByTestId("form-fill-progress")).toHaveTextContent(
      /of 25 fields have values/
    );
    expect(screen.getByTestId("form-fill-manual-banner")).toBeInTheDocument();
    expect(screen.getByTestId("form-fill-summary")).toHaveTextContent(
      "Last reviewed"
    );
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

  test("Test 8: Header shows app number, customer, important notes, Back link", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient {...defaultProps} initialFields={buildFields()} />
    );

    expect(screen.getByText("APP-0001")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByTestId("form-fill-important-notes")).toHaveTextContent(
      "ociservices.gov.in"
    );
    const back = screen.getByRole("link", { name: /Back to Review/i });
    expect(back).toHaveAttribute("href", "/applications/app-1/review");
  });
});

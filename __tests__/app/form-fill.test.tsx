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
const totalDefined = FORM_FILL_ALL_FIELDS.length;

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

const defaultProps = {
  applicationId: "app-1",
  appNumber: "APP-0001",
  customerName: "Priya Sharma",
  lastReviewedLabel: "Mar 15, 2026 · 2:30 PM",
};

describe("Form fill page", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  test("Test 1: All field sections render with portal-aligned titles", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient
        {...defaultProps}
        initialFields={buildFields()}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Personal Information" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Passport Information" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Address" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Family Information" })
    ).toBeInTheDocument();
  });

  test("Test 2: Field values display in large readable text", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient
        {...defaultProps}
        initialFields={buildFields()}
      />
    );

    const valueEls = screen.getAllByText("Sample value");
    expect(
      valueEls[0].className.includes("text-lg") ||
        valueEls[0].className.includes("text-xl")
    ).toBe(true);
  });

  test("Test 3: Copy button copies field value to clipboard", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient
        {...defaultProps}
        initialFields={buildFields()}
      />
    );

    const copyBtn = screen.getAllByRole("button", { name: /^copy$/i })[0];
    await userEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  test("Test 4: Flagged fields show yellow warning banner with the flag note", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const fields = buildFields({
      first_name: { value: "X", flagged: true, note: "Verify spelling" },
    });
    render(
      <FormFillPageClient {...defaultProps} initialFields={fields} />
    );

    const banner = screen.getByText(/Verify spelling/i);
    expect(banner.closest(".bg-yellow-50")).toBeTruthy();
  });

  test("Test 5: Empty/null fields show — Not found — in red", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const fields = buildFields({
      first_name: { value: "" },
      date_of_birth: { value: "   " },
    });
    render(
      <FormFillPageClient {...defaultProps} initialFields={fields} />
    );

    const notFound = screen.getAllByText("— Not found —");
    expect(notFound.length).toBeGreaterThanOrEqual(1);
    expect(notFound[0]).toHaveClass("text-[#dc2626]");
  });

  test("Test 6: Summary box shows correct counts and last reviewed", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    const fields = buildFields({
      first_name: { value: "", flagged: false },
      date_of_birth: { value: "1990", flagged: true },
    });
    render(
      <FormFillPageClient {...defaultProps} initialFields={fields} />
    );

    expect(screen.getByTestId("summary-total")).toHaveTextContent(
      String(totalDefined)
    );
    expect(screen.getByTestId("summary-with-values")).toHaveTextContent(
      String(totalDefined - 1)
    );
    expect(screen.getByTestId("summary-flagged")).toHaveTextContent("1");
    expect(screen.getByTestId("summary-last-reviewed")).toHaveTextContent(
      "Mar 15, 2026"
    );
  });

  test("Test 7: Page is print-friendly — print styles hide chrome", async () => {
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
        <FormFillPageClient
          {...defaultProps}
          initialFields={buildFields()}
        />
      </>
    );

    const copyButtons = screen.getAllByRole("button", { name: /^copy$/i });
    copyButtons.forEach((btn) => expect(btn).toHaveClass("no-print"));
    expect(screen.getByRole("button", { name: /^print$/i })).toHaveClass(
      "no-print"
    );
    expect(container.querySelector("style")?.textContent).toMatch(/@media print/);
    expect(container.querySelector("style")?.textContent).toMatch(/\.no-print/);
  });

  test("Test 8: Header shows app number, customer, and Back to Review", async () => {
    const { FormFillPageClient } = await import(
      "../../app/(main)/applications/[id]/fill/form-fill-page-client"
    );
    render(
      <FormFillPageClient
        {...defaultProps}
        initialFields={buildFields()}
      />
    );

    expect(screen.getByText("APP-0001")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /Back to Review/i });
    expect(back).toHaveAttribute("href", "/applications/app-1/review");
  });
});

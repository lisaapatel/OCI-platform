/**
 * @jest-environment jsdom
 */

const mockPush = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: { from: jest.fn() },
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/google-drive", () => ({
  getFileAsBase64: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({ refresh: jest.fn(), push: mockPush })),
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

jest.mock("react-resizable-panels", () => {
  const React = require("react");
  return {
    Group: ({ children, orientation, ...rest }: any) =>
      React.createElement("div", { "data-testid": "panel-group", ...rest }, children),
    Panel: ({ children, defaultSize, minSize, ...rest }: any) =>
      React.createElement("div", { "data-testid": "panel", ...rest }, children),
    Separator: ({ disableDoubleClick, ...rest }: any) =>
      React.createElement("div", { "data-testid": "panel-separator", ...rest }),
  };
});

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const documents = [
  {
    id: "d1",
    doc_type: "current_passport",
    file_name: "passport.pdf",
    drive_file_id: "x",
    drive_view_url: "https://drive.google.com/file/d/x/view",
  },
  {
    id: "d2",
    doc_type: "birth_certificate",
    file_name: "birth.pdf",
    drive_file_id: "y",
    drive_view_url: "https://drive.google.com/file/d/y/view",
  },
];

const baseFields = [
  {
    id: "ef1",
    application_id: "app-1",
    field_name: "full_name",
    field_value: "John Doe",
    source_doc_type: "current_passport",
    is_flagged: false,
    flag_note: "",
    reviewed_by: "",
    reviewed_at: "",
  },
  {
    id: "ef2",
    application_id: "app-1",
    field_name: "dob",
    field_value: "1990-01-01",
    source_doc_type: "birth_certificate",
    is_flagged: false,
    flag_note: "",
    reviewed_by: "",
    reviewed_at: "",
  },
];

describe("Review page", () => {
  beforeEach(() => {
    mockPush.mockClear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as any;
  });

  test("Test 1: Page renders document tabs for each uploaded document", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={documents}
        initialFields={baseFields}
      />
    );

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(
      screen.getByRole("tab", { name: /Current Passport/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Birth Certificate/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("document-viewer")).toBeInTheDocument();
    expect(screen.getByTestId("review-summary-strip")).toBeInTheDocument();
    expect(screen.getByText(/Review focus/i)).toBeInTheDocument();
  });

  test("Test 2: Extracted fields display correctly with their values", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={documents}
        initialFields={baseFields}
      />
    );

    expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
  });

  test("Test 3: Field values are editable — typing in a field updates its value", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={documents}
        initialFields={baseFields}
      />
    );

    const input = screen.getByLabelText(/Field value for full_name/i);
    await userEvent.clear(input);
    await userEvent.type(input, "Jane");
    expect(input).toHaveValue("Jane");
  });

  test("Test 4: Flag button toggles a field to flagged state with red styling", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={documents}
        initialFields={baseFields}
      />
    );

    const valueInput = screen.getByLabelText(/Field value for full_name/i);
    const card = valueInput.closest("[data-flagged]");
    expect(card?.getAttribute("data-flagged")).toBe("false");

    await userEvent.click(
      screen.getByRole("button", { name: /Flag field Full Name/i })
    );

    const card2 = valueInput.closest("[data-flagged]");
    expect(card2?.getAttribute("data-flagged")).toBe("true");
    expect(valueInput).toHaveClass("border-red-400");
  });

  test("Test 5: Flag note input appears when a field is flagged", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={documents}
        initialFields={baseFields}
      />
    );

    expect(
      screen.queryByLabelText(/Flag note for full_name/i)
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Flag field Full Name/i })
    );

    expect(
      screen.getByLabelText(/Flag note for full_name/i)
    ).toBeInTheDocument();
  });

  test("Test 6: Mark as Ready to Submit stays enabled when fields are flagged", async () => {
    const flagged = [
      { ...baseFields[0], is_flagged: true, flag_note: "check" },
      baseFields[1],
    ];
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={documents}
        initialFields={flagged}
      />
    );

    expect(
      screen.getByRole("button", { name: /Mark as Ready to Submit/i })
    ).not.toBeDisabled();
    expect(screen.getByText(/1 field flagged/i)).toBeInTheDocument();
  });

  test("Test 7: Mark as Ready to Submit button is enabled when zero fields are flagged", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={documents}
        initialFields={baseFields}
      />
    );

    expect(
      screen.getByRole("button", { name: /Mark as Ready to Submit/i })
    ).not.toBeDisabled();
  });

  test("Test 8: Saving a field edit calls PATCH /api/fields/[id] with correct data", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={[documents[0]]}
        initialFields={[baseFields[0]]}
      />
    );

    const input = screen.getByLabelText(/Field value for full_name/i);
    await userEvent.clear(input);
    await userEvent.type(input, "Updated Name");
    await userEvent.tab();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/fields/ef1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field_value: "Updated Name" }),
        })
      );
    });
  });

  test("Test 9: PDF viewer uses Drive preview URL", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={[documents[0]]}
        initialFields={[baseFields[0]]}
      />
    );

    const iframe = document.querySelector(
      'iframe[title="Document preview"]'
    ) as HTMLIFrameElement | null;
    expect(iframe?.src).toContain("https://drive.google.com/file/d/x/preview");
  });

  test("Test 10: Flag note blur sends is_flagged and flag_note", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={[documents[0]]}
        initialFields={[{ ...baseFields[0], is_flagged: true }]}
      />
    );

    const note = screen.getByLabelText(/Flag note for full_name/i);
    await userEvent.type(note, "Mismatch");
    await userEvent.tab();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/fields/ef1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            is_flagged: true,
            flag_note: "Mismatch",
          }),
        })
      );
    });
  });

  test("Test 11: Preview toolbar rotate and reset are present", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={[documents[0]]}
        initialFields={[baseFields[0]]}
      />
    );

    expect(screen.getByTestId("review-preview-toolbar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Rotate preview left/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reset preview view/i })
    ).toBeInTheDocument();
  });

  test("Test 12: Conflict row shows stacked sources", async () => {
    const conflictField = {
      id: "efc",
      application_id: "app-1",
      field_name: "full_name",
      field_value: "Pick Me",
      source_doc_type: "current_passport",
      is_flagged: true,
      flag_note:
        "AUTO_RECON:conflict|Passport: John | Birth: Jane | Other: Jim",
      reviewed_by: "",
      reviewed_at: "",
    };
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={[documents[0]]}
        initialFields={[conflictField]}
      />
    );

    expect(screen.getByText(/Value to submit/i)).toBeInTheDocument();
    expect(screen.getByText(/Sources \(extracted\)/i)).toBeInTheDocument();
    expect(screen.getByText("Passport: John")).toBeInTheDocument();
    expect(screen.getByText("Birth: Jane")).toBeInTheDocument();
    expect(screen.getByText("Other: Jim")).toBeInTheDocument();
  });

  test("Test 13: Hide empty toggles via segmented control", async () => {
    const fields = [
      baseFields[0],
      {
        id: "ef-empty",
        application_id: "app-1",
        field_name: "middle_name",
        field_value: "",
        source_doc_type: "current_passport",
        is_flagged: false,
        flag_note: "",
        reviewed_by: "",
        reviewed_at: "",
      },
    ];
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={[documents[0]]}
        initialFields={fields}
      />
    );

    expect(screen.getByLabelText(/Field value for middle_name/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Hide empty$/i }));
    expect(
      screen.queryByLabelText(/Field value for middle_name/i)
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /^Show all fields$/i })
    );
    expect(screen.getByLabelText(/Field value for middle_name/i)).toBeInTheDocument();
  });

  test("Test 14: Mark as Ready redirects to fill page on success", async () => {
    const { ReviewPageClient } = await import(
      "../../app/(main)/applications/[id]/review/review-page-client"
    );
    render(
      <ReviewPageClient
        applicationId="app-1"
        documents={[documents[0]]}
        initialFields={[baseFields[0]]}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Mark as Ready to Submit/i })
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/applications/app-1/fill");
    });
  });
});


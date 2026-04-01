/**
 * @jest-environment jsdom
 */

jest.mock("@/lib/supabase", () => ({
  supabase: { from: jest.fn() },
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/google-drive", () => ({
  createApplicationFolder: jest.fn(),
  uploadFileToDrive: jest.fn(),
  getFileAsBase64: jest.fn(),
  deleteFile: jest.fn(),
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

jest.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
    open: jest.fn(),
  }),
}));

import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Application, Document } from "@/lib/types";

function baseApp(over: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    app_number: "APP-0001",
    customer_name: "Priya Sharma",
    customer_email: "priya@example.com",
    customer_phone: "555-1234",
    service_type: "oci_new",
    status: "docs_pending",
    drive_folder_id: "folder-1",
    drive_folder_url: "https://drive.google.com/drive/folders/folder-1",
    notes: "",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "",
    ...over,
  };
}

describe("Application detail", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as any;
  });

  test("Test 1: Page renders customer name, app number, service type badge, status badge", async () => {
    const { ApplicationDetailClient } = await import(
      "../../app/applications/[id]/application-detail-client"
    );
    render(
      <ApplicationDetailClient application={baseApp()} initialDocuments={[]} />
    );

    const pageTitle = screen.getByRole("heading", { level: 1 });
    expect(pageTitle).toHaveTextContent("APP-0001");
    expect(pageTitle).toHaveTextContent("Priya Sharma");
    expect(screen.getByText("OCI New")).toBeInTheDocument();
    expect(screen.getByText("Docs Pending", { selector: "span" })).toBeInTheDocument();
  });

  test("Test 2: Document checklist shows all 6 required OCI documents", async () => {
    const { ApplicationDetailClient } = await import(
      "../../app/applications/[id]/application-detail-client"
    );
    render(
      <ApplicationDetailClient application={baseApp()} initialDocuments={[]} />
    );

    expect(screen.getByText("Current Passport")).toBeInTheDocument();
    expect(screen.getByText("Old/Previous Passport")).toBeInTheDocument();
    expect(screen.getByText("Birth Certificate")).toBeInTheDocument();
    expect(screen.getByText("Address Proof")).toBeInTheDocument();
    expect(screen.getByText("Applicant Photo")).toBeInTheDocument();
    expect(
      screen.getByText("Parent's Indian Passport or OCI Card")
    ).toBeInTheDocument();
  });

  test("Test 3: Uploaded documents show green checkmark, missing ones show upload button", async () => {
    const docs: Document[] = [
      {
        id: "d1",
        application_id: "app-1",
        doc_type: "current_passport",
        file_name: "pass.pdf",
        drive_file_id: "f1",
        drive_view_url: "https://drive.google.com/file/d/f1/view",
        extraction_status: "pending",
        uploaded_at: "2026-01-01T00:00:00Z",
      },
    ];
    const { ApplicationDetailClient } = await import(
      "../../app/applications/[id]/application-detail-client"
    );
    render(
      <ApplicationDetailClient application={baseApp()} initialDocuments={docs} />
    );

    const passportCard = screen.getByText("Current Passport").closest(
      ".rounded-xl"
    ) as HTMLElement;
    expect(passportCard).toBeTruthy();
    expect(within(passportCard).getByText(/UPLOADED/i)).toBeInTheDocument();

    const birthCard = screen.getByText("Birth Certificate").closest(
      ".rounded-xl"
    ) as HTMLElement;
    expect(within(birthCard).getByText(/NOT UPLOADED/i)).toBeInTheDocument();
    expect(
      within(birthCard).getByRole("button", { name: /^upload$/i })
    ).toBeInTheDocument();
  });

  test("Test 4: Progress bar shows correct count (e.g. 2 of 6 required documents uploaded)", async () => {
    const docs: Document[] = [
      {
        id: "d1",
        application_id: "app-1",
        doc_type: "current_passport",
        file_name: "a.pdf",
        drive_file_id: "1",
        drive_view_url: "",
        extraction_status: "pending",
        uploaded_at: "",
      },
      {
        id: "d2",
        application_id: "app-1",
        doc_type: "old_passport",
        file_name: "b.pdf",
        drive_file_id: "2",
        drive_view_url: "",
        extraction_status: "pending",
        uploaded_at: "",
      },
    ];
    const { ApplicationDetailClient } = await import(
      "../../app/applications/[id]/application-detail-client"
    );
    render(
      <ApplicationDetailClient application={baseApp()} initialDocuments={docs} />
    );

    expect(
      screen.getByText(/2 of 6 required documents uploaded/i)
    ).toBeInTheDocument();
  });

  test("Test 5: Process Documents button only appears when all required docs are uploaded", async () => {
    const requiredTypes = [
      "current_passport",
      "old_passport",
      "birth_certificate",
      "address_proof",
      "applicant_photo",
      "parent_indian_doc",
    ];
    const docs: Document[] = requiredTypes.map((doc_type, i) => ({
      id: `d${i}`,
      application_id: "app-1",
      doc_type,
      file_name: `${doc_type}.pdf`,
      drive_file_id: `f${i}`,
      drive_view_url: "",
      extraction_status: "pending",
      uploaded_at: "",
    }));

    const { ApplicationDetailClient } = await import(
      "../../app/applications/[id]/application-detail-client"
    );
    const { unmount } = render(
      <ApplicationDetailClient application={baseApp()} initialDocuments={[]} />
    );
    expect(
      screen.queryByRole("button", { name: /Process Documents/i })
    ).not.toBeInTheDocument();
    unmount();

    render(
      <ApplicationDetailClient application={baseApp()} initialDocuments={docs} />
    );
    expect(
      screen.getByRole("button", {
        name: /Process Documents with AI/i,
      })
    ).toBeInTheDocument();
  });

  test("Test 6: Open Google Drive Folder button has correct drive URL as href", async () => {
    const { ApplicationDetailClient } = await import(
      "../../app/applications/[id]/application-detail-client"
    );
    render(
      <ApplicationDetailClient application={baseApp()} initialDocuments={[]} />
    );

    const link = screen.getByRole("link", { name: /Open Google Drive Folder/i });
    expect(link).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/folder-1"
    );
  });

  test("Test 7: Status dropdown allows changing status", async () => {
    const { ApplicationDetailClient } = await import(
      "../../app/applications/[id]/application-detail-client"
    );
    render(
      <ApplicationDetailClient application={baseApp()} initialDocuments={[]} />
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/^status$/i), "ready_for_review");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/applications/app-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("ready_for_review"),
      })
    );
  });
});

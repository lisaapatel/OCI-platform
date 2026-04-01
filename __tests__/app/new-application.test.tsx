/**
 * @jest-environment jsdom
 */

const push = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ order: jest.fn() }),
    }),
  },
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock("@/lib/google-drive", () => ({
  createApplicationFolder: jest.fn(),
  getGoogleDriveClient: jest.fn(),
  uploadFileToDrive: jest.fn(),
  getFileAsBase64: jest.fn(),
  deleteFile: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({ push })),
}));

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("New Application page", () => {
  beforeEach(() => {
    push.mockClear();
    global.fetch = jest.fn() as any;
  });

  test("Test 1: Form renders all required fields — customer name, email, phone, service type selector", async () => {
    const Page = (await import("../../app/applications/new/page")).default;
    render(<Page />);

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^phone$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/service type/i)).toBeInTheDocument();
  });

  test("Test 2: OCI New and OCI Renewal options are selectable in service type", async () => {
    const Page = (await import("../../app/applications/new/page")).default;
    render(<Page />);

    const select = screen.getByLabelText(/service type/i);
    expect(
      screen.getByRole("option", { name: /OCI New Application/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /OCI Renewal \/ Reissue/i })
    ).toBeInTheDocument();

    await userEvent.selectOptions(select, "oci_new");
    expect(select).toHaveValue("oci_new");
    await userEvent.selectOptions(select, "oci_renewal");
    expect(select).toHaveValue("oci_renewal");
  });

  test("Test 3: Passport Renewal shows as disabled/coming soon", async () => {
    const Page = (await import("../../app/applications/new/page")).default;
    render(<Page />);

    const opt = screen.getByRole("option", {
      name: /Passport Renewal.*Coming Soon/i,
    });
    expect(opt).toBeDisabled();
    expect(screen.getByText(/Passport Renewal is disabled/i)).toBeInTheDocument();
  });

  test("Test 4: Submit button is disabled when customer name is empty", async () => {
    const Page = (await import("../../app/applications/new/page")).default;
    render(<Page />);

    const submit = screen.getByRole("button", { name: /create application/i });
    expect(submit).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText(/service type/i), "oci_new");
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/full name/i), "A");
    expect(submit).not.toBeDisabled();
  });

  test("Test 5: On successful submit, router redirects to /applications/[id]", async () => {
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (global.fetch as jest.Mock).mockReturnValue(fetchPromise);

    const Page = (await import("../../app/applications/new/page")).default;
    render(<Page />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), "Priya Sharma");
    await user.selectOptions(screen.getByLabelText(/service type/i), "oci_new");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    resolveFetch!({
      ok: true,
      json: async () => ({ id: "abc-uuid" }),
    });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/applications/abc-uuid");
    });
    expect(
      await screen.findByRole("button", { name: /create application/i })
    ).toBeInTheDocument();
  });

  test("Test 6: Shows loading state on submit button while API call is in progress", async () => {
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (global.fetch as jest.Mock).mockReturnValue(fetchPromise);

    const Page = (await import("../../app/applications/new/page")).default;
    render(<Page />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), "Priya Sharma");
    await user.selectOptions(screen.getByLabelText(/service type/i), "oci_new");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();

    resolveFetch!({ ok: true, json: async () => ({ id: "1" }) });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Creating…" })
      ).not.toBeInTheDocument();
    });
  });

  test("Test 7: Shows error message if API call fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Failed to create application: boom" }),
    });

    const Page = (await import("../../app/applications/new/page")).default;
    render(<Page />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), "Priya Sharma");
    await user.selectOptions(screen.getByLabelText(/service type/i), "oci_new");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

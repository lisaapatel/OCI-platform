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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** OCI path that only needs Q1 (existing reissue) + default under-18 No */
async function fillOciIntakeExistingReissue(user: ReturnType<typeof userEvent.setup>) {
  const q1 = screen.getByRole("group", {
    name: /first-time OCI registration or an existing/i,
  });
  await user.click(
    within(q1).getByRole("radio", { name: /Existing OCI reissue \/ update/i })
  );
}

async function fillOciIntakeFirstTimePrevIndian(
  user: ReturnType<typeof userEvent.setup>
) {
  const q1 = screen.getByRole("group", {
    name: /first-time OCI registration or an existing/i,
  });
  await user.click(
    within(q1).getByRole("radio", { name: /First-time OCI registration/i })
  );
  const q2 = screen.getByRole("group", {
    name: /For first-time registration, which applies/i,
  });
  await user.click(
    within(q2).getByRole("radio", {
      name: /Previously held Indian citizenship or Indian passport/i,
    })
  );
}

describe("New Application page", () => {
  beforeEach(() => {
    push.mockClear();
    global.fetch = jest.fn() as any;
  });

  test("Test 1: Form renders all required fields — customer name, email, phone, service type selector", async () => {
    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^phone$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/service type/i)).toBeInTheDocument();
  });

  test("Test 2: OCI New and OCI Renewal options are selectable in service type", async () => {
    const Page = (await import("../../app/(main)/applications/new/page")).default;
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

  test("Test 3: Indian Passport Renewal option is available and selectable", async () => {
    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    const select = screen.getByLabelText(/service type/i);
    const opt = screen.getByRole("option", {
      name: /Indian Passport Renewal \(VFS Global USA\)/i,
    });
    expect(opt).not.toBeDisabled();
    await userEvent.selectOptions(select, "passport_renewal");
    expect(select).toHaveValue("passport_renewal");
  });

  test("Test 4: Submit disabled until OCI intake is complete when OCI is selected", async () => {
    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    const submit = screen.getByRole("button", { name: /create application/i });
    expect(submit).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText(/service type/i), "oci_new");
    await userEvent.type(screen.getByLabelText(/full name/i), "A");
    expect(submit).toBeDisabled();

    await fillOciIntakeExistingReissue(userEvent.setup());
    expect(submit).not.toBeDisabled();
  });

  test("Test 5: On successful submit, router redirects to /applications/[id]", async () => {
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (global.fetch as jest.Mock).mockReturnValue(fetchPromise);

    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), "Priya Sharma");
    await user.selectOptions(screen.getByLabelText(/service type/i), "oci_new");
    await fillOciIntakeExistingReissue(user);
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

    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), "Priya Sharma");
    await user.selectOptions(screen.getByLabelText(/service type/i), "oci_new");
    await fillOciIntakeExistingReissue(user);
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

    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), "Priya Sharma");
    await user.selectOptions(screen.getByLabelText(/service type/i), "oci_new");
    await fillOciIntakeExistingReissue(user);
    await user.click(screen.getByRole("button", { name: /create application/i }));

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  test("Test 8: OCI submit sends is_minor true when under 18 Yes", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "with-minor" }),
    });

    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), "Minor Case");
    await user.selectOptions(screen.getByLabelText(/service type/i), "oci_new");
    await fillOciIntakeExistingReissue(user);
    const minorGroup = screen.getByRole("group", { name: /under 18/i });
    await user.click(within(minorGroup).getByRole("radio", { name: /^Yes$/i }));
    await user.click(screen.getByRole("button", { name: /create application/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/applications");
    expect(call).toBeDefined();
    const body = JSON.parse(call![1].body as string);
    expect(body.is_minor).toBe(true);
    expect(body.oci_intake_variant).toBe("misc_reissue");
  });

  test("OCI intake questions are hidden for non-OCI service", async () => {
    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    await userEvent.selectOptions(
      screen.getByLabelText(/service type/i),
      "passport_renewal"
    );

    expect(
      screen.queryByRole("group", {
        name: /first-time OCI registration or an existing/i,
      })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/minor applicant/i)).toBeInTheDocument();
  });

  test("OCI submit sends oci_intake_variant from first-time + prev Indian path", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "x" }),
    });

    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), "Test User");
    await user.selectOptions(screen.getByLabelText(/service type/i), "oci_renewal");
    await fillOciIntakeFirstTimePrevIndian(user);
    await user.click(screen.getByRole("button", { name: /create application/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/applications");
    const body = JSON.parse(call![1].body as string);
    expect(body.oci_intake_variant).toBe("new_prev_indian");
    expect(body.service_type).toBe("oci_renewal");
  });

  test("Switching away from OCI clears intake; switching back requires answers again", async () => {
    const Page = (await import("../../app/(main)/applications/new/page")).default;
    render(<Page />);

    const user = userEvent.setup();
    const select = screen.getByLabelText(/service type/i);
    await user.selectOptions(select, "oci_new");
    await user.type(screen.getByLabelText(/full name/i), "X");
    await fillOciIntakeExistingReissue(user);
    expect(
      screen.getByRole("button", { name: /create application/i })
    ).not.toBeDisabled();

    await user.selectOptions(select, "passport_renewal");
    expect(
      screen.queryByRole("group", {
        name: /first-time OCI registration or an existing/i,
      })
    ).not.toBeInTheDocument();

    await user.selectOptions(select, "oci_new");
    const submit = screen.getByRole("button", { name: /create application/i });
    expect(submit).toBeDisabled();
    await fillOciIntakeExistingReissue(user);
    expect(submit).not.toBeDisabled();
  });
});

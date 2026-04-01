/**
 * @jest-environment jsdom
 */

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: "1",
              app_number: "APP-0001",
              customer_name: "Priya Sharma",
              customer_email: "priya@example.com",
              customer_phone: "555-1234",
              service_type: "oci_new",
              status: "docs_pending",
              created_at: "2026-03-01T00:00:00Z",
            },
            {
              id: "2",
              app_number: "APP-0002",
              customer_name: "Raj Patel",
              customer_email: "raj@example.com",
              customer_phone: "555-5678",
              service_type: "oci_renewal",
              status: "ready_for_review",
              created_at: "2026-03-05T00:00:00Z",
            },
            {
              id: "3",
              app_number: "APP-0003",
              customer_name: "Meera Nair",
              customer_email: "meera@example.com",
              customer_phone: "555-9999",
              service_type: "oci_new",
              status: "submitted",
              created_at: "2026-03-10T00:00:00Z",
            },
          ],
          error: null,
        }),
      }),
    }),
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
}));

jest.mock("next/link", () => {
  const React = require("react");
  return function Link({
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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("Dashboard", () => {
  test("Test 1: Dashboard renders the application table", async () => {
    const Dashboard = (await import("../../app/dashboard/page")).default;
    render(<Dashboard />);

    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Raj Patel")).toBeInTheDocument();
    expect(screen.getByText("Meera Nair")).toBeInTheDocument();
  });

  test("Test 2: Status badges display correctly", async () => {
    const Dashboard = (await import("../../app/dashboard/page")).default;
    render(<Dashboard />);

    await screen.findByText("Priya Sharma");

    expect(screen.getByText("Docs Pending", { selector: "span" })).toBeInTheDocument();
    expect(
      screen.getByText("Ready for Review", { selector: "span" })
    ).toBeInTheDocument();
    expect(screen.getByText("Submitted", { selector: "span" })).toBeInTheDocument();
  });

  test("Test 3: Stats row shows correct counts", async () => {
    const Dashboard = (await import("../../app/dashboard/page")).default;
    render(<Dashboard />);

    await screen.findByText("Priya Sharma");

    expect(within(screen.getByTestId("stat-total")).getByText("3")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("stat-docs-pending")).getByText("1")
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("stat-ready-for-review")).getByText("1")
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("stat-submitted")).getByText("1")
    ).toBeInTheDocument();
  });

  test("Test 4: Search filter works", async () => {
    const Dashboard = (await import("../../app/dashboard/page")).default;
    render(<Dashboard />);
    await screen.findByText("Priya Sharma");

    const user = userEvent.setup();
    const search = screen.getByLabelText("Search by customer name");
    await user.type(search, "priya");

    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.queryByText("Raj Patel")).not.toBeInTheDocument();
    expect(screen.queryByText("Meera Nair")).not.toBeInTheDocument();
  });

  test("Test 5: Status filter works", async () => {
    const Dashboard = (await import("../../app/dashboard/page")).default;
    render(<Dashboard />);
    await screen.findByText("Priya Sharma");

    const user = userEvent.setup();
    const status = screen.getByLabelText("Filter by status");
    await user.selectOptions(status, "submitted");

    expect(screen.getByText("Meera Nair")).toBeInTheDocument();
    expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();
    expect(screen.queryByText("Raj Patel")).not.toBeInTheDocument();
  });

  test("Test 6: New Application button exists and links to /applications/new", async () => {
    const Dashboard = (await import("../../app/dashboard/page")).default;
    render(<Dashboard />);

    const link = screen.getByRole("link", { name: "New Application" });
    expect(link).toHaveAttribute("href", "/applications/new");
  });

  test("Test 7: App numbers display in correct format", async () => {
    const Dashboard = (await import("../../app/dashboard/page")).default;
    render(<Dashboard />);

    expect(await screen.findByText("APP-0001")).toBeInTheDocument();
    expect(screen.getByText("APP-0002")).toBeInTheDocument();
    expect(screen.getByText("APP-0003")).toBeInTheDocument();
  });

  test("Test 8: Dates are formatted correctly", async () => {
    const Dashboard = (await import("../../app/dashboard/page")).default;
    render(<Dashboard />);
    await screen.findByText("Priya Sharma");

    expect(screen.queryByText("2026-03-01T00:00:00Z")).not.toBeInTheDocument();
    expect(screen.getByText(/Mar\s+1,\s+2026|March\s+1,\s+2026/)).toBeInTheDocument();
  });
});

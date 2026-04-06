import {
  computeStructuredServiceMargin,
  parseNonNegativeMoney,
  usesStructuredBilling,
} from "@/lib/billing-financials";

describe("billing-financials", () => {
  test("usesStructuredBilling for OCI and passport renewal only", () => {
    expect(usesStructuredBilling("oci_new")).toBe(true);
    expect(usesStructuredBilling("oci_renewal")).toBe(true);
    expect(usesStructuredBilling("passport_renewal")).toBe(true);
    expect(usesStructuredBilling("passport_us_renewal_test")).toBe(false);
  });

  test("parseNonNegativeMoney", () => {
    expect(parseNonNegativeMoney("")).toBe(null);
    expect(parseNonNegativeMoney("0")).toBe(0);
    expect(parseNonNegativeMoney("250.5")).toBe(250.5);
    expect(parseNonNegativeMoney("-1")).toBe("invalid");
    expect(parseNonNegativeMoney("x")).toBe("invalid");
  });

  test("computeStructuredServiceMargin prefers explicit service fee", () => {
    expect(
      computeStructuredServiceMargin({
        customerPrice: 500,
        governmentFees: 250,
        explicitServiceFee: 260,
      })
    ).toBe(260);
  });

  test("computeStructuredServiceMargin derives from total minus government", () => {
    expect(
      computeStructuredServiceMargin({
        customerPrice: 500,
        governmentFees: 250,
        explicitServiceFee: null,
      })
    ).toBe(250);
  });

  test("computeStructuredServiceMargin clamps implied at zero", () => {
    expect(
      computeStructuredServiceMargin({
        customerPrice: 100,
        governmentFees: 150,
        explicitServiceFee: null,
      })
    ).toBe(0);
  });

  test("computeStructuredServiceMargin null without enough inputs", () => {
    expect(
      computeStructuredServiceMargin({
        customerPrice: 500,
        governmentFees: null,
        explicitServiceFee: null,
      })
    ).toBe(null);
  });
});

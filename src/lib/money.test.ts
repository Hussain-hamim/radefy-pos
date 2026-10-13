import { describe, it, expect } from "vitest";
import { parseFixed, decimal, money, qty } from "./money";
describe("exact AFN and quantity input", () => {
  it("converts amounts without binary rounding", () => {
    expect(parseFixed("0.29")).toBe("29");
    expect(parseFixed("1234567890.12")).toBe("123456789012");
    expect(parseFixed("1.125", 3)).toBe("1125");
  });
  it("rejects excess precision, negative and non-finite amounts", () => {
    for (const input of ["1.001", "-1", "Infinity", "1e5", "NaN", ""])
      expect(() => parseFixed(input)).toThrow();
  });
  it("formats exact quantities and refunds", () => {
    expect(qty("10000")).toBe("10");
    expect(qty("1250")).toBe("1.25");
    expect(qty("0")).toBe("0");
    expect(decimal("29")).toBe("0.29");
    expect(money("-123450")).toBe("-1,234.50");
  });
});

it("preserves negative sub-unit amounts and Kabul business dates", async () => {
  const { money, businessDate } = await import("./money");
  expect(money("-25")).toBe("-0.25");
  expect(businessDate("2026-10-12 20:00:00")).toBe("2026-10-13");
});

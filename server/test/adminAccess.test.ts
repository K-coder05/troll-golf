import { describe, expect, it } from "vitest";
import { isAdminSecret } from "../src/admin/auth";
import { ADMIN_BUNDLE_TOKEN_TTL_MS, issueAdminBundleToken, redeemAdminBundleToken } from "../src/admin/bundle";

describe("admin secret", () => {
  it("accepts only the exact secret from the env var", () => {
    expect(isAdminSecret("hunter2", "hunter2")).toBe(true);
    expect(isAdminSecret("hunter3", "hunter2")).toBe(false);
    expect(isAdminSecret("", "hunter2")).toBe(false);
    expect(isAdminSecret(undefined, "hunter2")).toBe(false);
    expect(isAdminSecret(42, "hunter2")).toBe(false);
  });

  it("makes nobody the Admin when no secret is configured", () => {
    expect(isAdminSecret("anything", undefined)).toBe(false);
    expect(isAdminSecret("", "")).toBe(false);
  });
});

describe("admin bundle tokens", () => {
  it("work once, and only before they expire", () => {
    const token = issueAdminBundleToken(1000);
    expect(redeemAdminBundleToken(token, 1001)).toBe(true);
    expect(redeemAdminBundleToken(token, 1002)).toBe(false);
    const late = issueAdminBundleToken(1000);
    expect(redeemAdminBundleToken(late, 1000 + ADMIN_BUNDLE_TOKEN_TTL_MS)).toBe(false);
    expect(redeemAdminBundleToken("made-up", 1000)).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import {
  AUTH_VALIDATION_TTL_MS,
  isAuthValidationFresh,
} from "./auth-validation-policy.ts";

describe("authentication validation policy", () => {
  test("reuses only validations inside the shared freshness window", () => {
    const now = 1_000_000;
    expect(isAuthValidationFresh(now - AUTH_VALIDATION_TTL_MS + 1, now)).toBe(true);
    expect(isAuthValidationFresh(now - AUTH_VALIDATION_TTL_MS, now)).toBe(false);
    expect(isAuthValidationFresh(0, now)).toBe(false);
  });
});

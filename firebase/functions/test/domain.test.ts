import { describe, expect, test } from "bun:test";
import {
  deriveRole,
  normalizeSerial,
  validateCheckoutItems,
  validateEquipmentName,
  validateTagId,
} from "../src/domain.js";

const validTag = "gg:01J9Z6M4Y7X3N8K2D5P0Q1R4TC";

describe("role derivation", () => {
  test("derives exact teacher and nested student domains", () => {
    expect(deriveRole("teacher@sst.edu.sg")).toBe("teacher");
    expect(deriveRole("student@class.ssts.edu.sg")).toBe("student");
  });

  test("denies the bare student root and unrelated domains", () => {
    expect(() => deriveRole("student@ssts.edu.sg")).toThrow("unsupported-domain");
    expect(() => deriveRole("person@gmail.com")).toThrow("unsupported-domain");
    expect(() => deriveRole("broken")).toThrow("invalid-email");
  });
});

describe("equipment validation", () => {
  test("validates GearGuard ULIDs", () => {
    expect(validateTagId(validTag)).toBe(validTag);
    expect(() => validateTagId("gg:not-a-ulid")).toThrow("invalid-tag");
    expect(() => validateTagId("gg:01J9Z6M4Y7X3N8K2D5P0Q1R4TI")).toThrow("invalid-tag");
  });

  test("normalizes serials without losing the display form", () => {
    expect(normalizeSerial(" mc-cam  01 ")).toEqual({
      display: "mc-cam 01",
      normalized: "MC-CAM 01",
    });
    expect(() => normalizeSerial("")).toThrow("invalid-serial");
    expect(() => normalizeSerial("x".repeat(51))).toThrow("invalid-serial");
  });

  test("enforces equipment name limits", () => {
    expect(validateEquipmentName("  Canon R50 ")).toBe("Canon R50");
    expect(() => validateEquipmentName("")).toThrow("invalid-name");
    expect(() => validateEquipmentName("x".repeat(101))).toThrow("invalid-name");
  });
});

describe("checkout validation", () => {
  test("accepts valid issue details", () => {
    expect(validateCheckoutItems([{ tagId: validTag, condition: "has_issue", issueText: " Cracked cap " }])).toEqual([
      { tagId: validTag, condition: "has_issue", issueText: "Cracked cap" },
    ]);
  });

  test("rejects missing issue text and duplicate tags", () => {
    expect(() => validateCheckoutItems([{ tagId: validTag, condition: "has_issue" }])).toThrow("invalid-issue");
    expect(() =>
      validateCheckoutItems([
        { tagId: validTag, condition: "no_issues" },
        { tagId: validTag, condition: "no_issues" },
      ]),
    ).toThrow("duplicate-tag");
  });

  test("enforces the twenty-item limit", () => {
    expect(() =>
      validateCheckoutItems(
        Array.from({ length: 21 }, (_, index) => ({
          tagId: `gg:${index.toString().padStart(26, "0")}`,
          condition: "no_issues",
        })),
      ),
    ).toThrow("batch-too-large");
  });
});


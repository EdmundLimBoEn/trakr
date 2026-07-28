export type Role = "student" | "teacher";
export type ItemCondition = "no_issues" | "has_issue";

const TAG_PATTERN = /^gg:[0-9A-HJKMNP-TV-Z]{26}$/;

export function deriveRole(email: string): Role {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("invalid-email");
  }
  const domain = parts[1];
  if (domain === "sst.edu.sg") return "teacher";
  if (domain !== "ssts.edu.sg" && domain.endsWith(".ssts.edu.sg")) return "student";
  throw new Error("unsupported-domain");
}

export function validateTagId(value: unknown): string {
  if (typeof value !== "string" || !TAG_PATTERN.test(value)) {
    throw new Error("invalid-tag");
  }
  return value;
}

export function normalizeSerial(value: unknown): { display: string; normalized: string } {
  if (typeof value !== "string") throw new Error("invalid-serial");
  const display = value.trim().replace(/\s+/g, " ");
  if (display.length < 1 || display.length > 50) throw new Error("invalid-serial");
  return { display, normalized: display.toUpperCase() };
}

export function validateEquipmentName(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid-name");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 100) throw new Error("invalid-name");
  return name;
}

export interface CheckoutInputItem {
  tagId: string;
  condition: ItemCondition;
  issueText?: string;
}

export function validateCheckoutItems(value: unknown): CheckoutInputItem[] {
  if (!Array.isArray(value) || value.length < 1) throw new Error("empty-batch");
  if (value.length > 20) throw new Error("batch-too-large");

  const seen = new Set<string>();
  return value.map((raw) => {
    if (typeof raw !== "object" || raw === null) throw new Error("invalid-item");
    const record = raw as Record<string, unknown>;
    const tagId = validateTagId(record.tagId);
    if (seen.has(tagId)) throw new Error("duplicate-tag");
    seen.add(tagId);

    const condition = record.condition;
    if (condition !== "no_issues" && condition !== "has_issue") {
      throw new Error("invalid-condition");
    }
    const text = typeof record.issueText === "string" ? record.issueText.trim() : "";
    if (condition === "has_issue" && (text.length < 1 || text.length > 500)) {
      throw new Error("invalid-issue");
    }
    return {
      tagId,
      condition,
      ...(condition === "has_issue" ? { issueText: text } : {}),
    };
  });
}

export function validateString(value: unknown, field: string, maximum = 100): string {
  if (typeof value !== "string") throw new Error(`invalid-${field}`);
  const result = value.trim();
  if (result.length < 1 || result.length > maximum) throw new Error(`invalid-${field}`);
  return result;
}


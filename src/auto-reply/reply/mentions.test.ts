import { describe, expect, it } from "vitest";
import {
  matchesMentionPatterns,
  matchesMentionWithExplicit,
  stripStructuralPrefixes,
} from "./mentions.js";

describe("matchesMentionPatterns", () => {
  it("returns true for catch-all pattern on empty text (media-only messages)", () => {
    const catchAll = [/.*/];
    expect(matchesMentionPatterns("", catchAll)).toBe(true);
  });

  it("returns false for specific pattern on empty text", () => {
    const specific = [/\bbot\b/i];
    expect(matchesMentionPatterns("", specific)).toBe(false);
  });

  it("returns false when no regexes are configured", () => {
    expect(matchesMentionPatterns("hello bot", [])).toBe(false);
  });

  it("matches specific pattern on matching text", () => {
    const specific = [/\bbot\b/i];
    expect(matchesMentionPatterns("hey Bot!", specific)).toBe(true);
  });
});

describe("matchesMentionWithExplicit", () => {
  it("returns true for catch-all pattern on empty text without explicit signal", () => {
    expect(
      matchesMentionWithExplicit({
        text: "",
        mentionRegexes: [/.*/],
      }),
    ).toBe(true);
  });

  it("returns explicit when text is empty and pattern does not match empty string", () => {
    expect(
      matchesMentionWithExplicit({
        text: "",
        mentionRegexes: [/\bbot\b/i],
        explicit: { hasAnyMention: true, isExplicitlyMentioned: true, canResolveExplicit: true },
      }),
    ).toBe(true);

    expect(
      matchesMentionWithExplicit({
        text: "",
        mentionRegexes: [/\bbot\b/i],
        explicit: { hasAnyMention: true, isExplicitlyMentioned: false, canResolveExplicit: true },
      }),
    ).toBe(false);
  });
});

describe("stripStructuralPrefixes", () => {
  it("returns empty string for undefined input at runtime", () => {
    expect(stripStructuralPrefixes(undefined as unknown as string)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(stripStructuralPrefixes("")).toBe("");
  });

  it("strips sender prefix labels", () => {
    expect(stripStructuralPrefixes("John: hello")).toBe("hello");
  });

  it("passes through plain text", () => {
    expect(stripStructuralPrefixes("just a message")).toBe("just a message");
  });
});

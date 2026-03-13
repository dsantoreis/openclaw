import { describe, expect, it } from "vitest";
import { appendCronStyleCurrentTimeLine, resolveCronStyleNow } from "./current-time.js";

const cfg = { agents: { defaults: { userTimezone: "UTC" } } };

describe("resolveCronStyleNow", () => {
  it("returns a formatted time line", () => {
    const result = resolveCronStyleNow(cfg, Date.UTC(2026, 2, 13, 12, 0, 0));
    expect(result.timeLine).toMatch(/^Current time:/);
    expect(result.userTimezone).toBe("UTC");
  });
});

describe("appendCronStyleCurrentTimeLine", () => {
  const nowMs = Date.UTC(2026, 2, 13, 12, 0, 0);

  it("appends time line to text without one", () => {
    const result = appendCronStyleCurrentTimeLine("Hello agent", cfg, nowMs);
    expect(result).toContain("Hello agent\nCurrent time:");
  });

  it("returns empty string unchanged", () => {
    expect(appendCronStyleCurrentTimeLine("", cfg, nowMs)).toBe("");
    expect(appendCronStyleCurrentTimeLine("   ", cfg, nowMs)).toBe("");
  });

  it("replaces stale Current time line with fresh timestamp", () => {
    const staleText =
      "HEARTBEAT prompt\nCurrent time: Thursday, March 12th, 2026 — 3:00 PM (UTC) / 2026-03-12 15:00 UTC";
    const result = appendCronStyleCurrentTimeLine(staleText, cfg, nowMs);

    // Should NOT contain the old timestamp
    expect(result).not.toContain("2026-03-12 15:00");
    // Should contain the new timestamp
    expect(result).toContain("2026-03-13 12:00");
    // Should still have the prompt prefix
    expect(result).toContain("HEARTBEAT prompt");
    // Should have exactly one Current time line
    const matches = result.match(/Current time:/g);
    expect(matches).toHaveLength(1);
  });

  it("replaces stale time even when it is the last line", () => {
    const staleText = "Do stuff\nCurrent time: old-value";
    const result = appendCronStyleCurrentTimeLine(staleText, cfg, nowMs);
    expect(result).not.toContain("old-value");
    expect(result).toContain("Current time:");
    expect(result).toContain("2026-03-13");
  });

  it("handles text where Current time is the only line", () => {
    const staleText = "Current time: stale-stamp";
    const result = appendCronStyleCurrentTimeLine(staleText, cfg, nowMs);
    expect(result).not.toContain("stale-stamp");
    expect(result).toContain("Current time:");
  });
});

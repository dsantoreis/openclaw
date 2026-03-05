import { describe, expect, it } from "vitest";
import { parseTelegramChatIdFromTarget } from "./conversation-id.js";

describe("parseTelegramChatIdFromTarget", () => {
  it("parses direct telegram targets", () => {
    expect(parseTelegramChatIdFromTarget("telegram:-100123")).toBe("-100123");
  });

  it("parses telegram group targets with topic suffix", () => {
    expect(parseTelegramChatIdFromTarget("telegram:group:-100123:topic:42")).toBe("-100123");
  });

  it("returns undefined for non-telegram targets", () => {
    expect(parseTelegramChatIdFromTarget("slack:C123")).toBeUndefined();
  });
});

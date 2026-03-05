import { describe, expect, it } from "vitest";
import { buildTelegramMessageContextForTest } from "./bot-message-context.test-harness.js";

describe("buildTelegramMessageContext multi-account defaults", () => {
  it("drops inbound DMs for non-default accounts without explicit bindings", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      accountId: "jarvis2",
      message: {
        chat: { id: 99_001, type: "private" },
        from: { id: 41, first_name: "Guido" },
        text: "/ping",
      },
    });

    expect(ctx).toBeNull();
  });

  it("still blocks when account enabled flags are absent", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      accountId: "jarvis2",
      message: {
        chat: { id: 99_002, type: "private" },
        from: { id: 42, first_name: "Guido" },
        text: "/ping",
      },
    });

    expect(ctx).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildTelegramMessageContextForTest } from "./bot-message-context.test-harness.js";

describe("buildTelegramMessageContext multi-account defaults", () => {
  it("processes inbound DMs for non-default accounts without explicit bindings", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      accountId: "jarvis2",
      message: {
        chat: { id: 99_001, type: "private" },
        from: { id: 41, first_name: "Guido" },
        text: "/ping",
      },
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.accountId).toBe("jarvis2");
  });

  it("routes non-default account even when default account is disabled", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      accountId: "jarvis2",
      message: {
        chat: { id: 99_002, type: "private" },
        from: { id: 42, first_name: "Alex" },
        text: "hello",
      },
      cfg: {
        channels: {
          telegram: {
            accounts: {
              default: { enabled: false },
              jarvis2: { enabled: true },
            },
            defaultAccount: "default",
          },
        },
      },
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.accountId).toBe("jarvis2");
  });

  it("routes non-default account when defaultAccount points to a missing id", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      accountId: "brainstorm",
      message: {
        chat: { id: 99_003, type: "private" },
        from: { id: 43, first_name: "Maya" },
        text: "hello",
      },
      cfg: {
        channels: {
          telegram: {
            accounts: {
              brainstorm: { enabled: true },
            },
            defaultAccount: "missing",
          },
        },
      },
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.accountId).toBe("brainstorm");
  });
});

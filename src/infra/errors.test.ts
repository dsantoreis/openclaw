import { describe, expect, it } from "vitest";
import { isRecoverableTlsSessionNullDeref } from "./errors.js";

describe("isRecoverableTlsSessionNullDeref", () => {
  it("matches Node TLS setSession null deref stack", () => {
    const err = new Error("Cannot read properties of null (reading 'setSession')");
    err.stack = [
      "TypeError: Cannot read properties of null (reading 'setSession')",
      "    at TLSSocket.setSession (node:_tls_wrap:1132:16)",
      "    at Object.connect (node:_tls_wrap:1826:13)",
    ].join("\n");
    expect(isRecoverableTlsSessionNullDeref(err)).toBe(true);
  });

  it("does not match unrelated uncaught errors", () => {
    expect(isRecoverableTlsSessionNullDeref(new Error("Fatal Gateway error: 4014"))).toBe(false);
  });
});

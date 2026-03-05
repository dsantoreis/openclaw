import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sessionHasAssistantMessages, sessionHasUserMessages } from "./pi-embedded-helpers.js";

const tempDirs: string[] = [];

async function writeSession(lines: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-session-gate-"));
  tempDirs.push(dir);
  const file = path.join(dir, "session.jsonl");
  await fs.writeFile(file, `${lines.join("\n")}\n`, "utf-8");
  return file;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("session context-injection gating", () => {
  it("finds prior user message content", async () => {
    const sessionFile = await writeSession([
      '{"type":"message","message":{"role":"user","content":"hello"}}',
    ]);
    await expect(sessionHasUserMessages(sessionFile)).resolves.toBe(true);
  });

  it("does not treat stale user-only transcript as follow-up turn", async () => {
    const sessionFile = await writeSession([
      '{"type":"message","message":{"role":"user","content":"first prompt"}}',
    ]);
    await expect(sessionHasAssistantMessages(sessionFile)).resolves.toBe(false);
  });

  it("treats transcript with assistant turn as follow-up turn", async () => {
    const sessionFile = await writeSession([
      '{"type":"message","message":{"role":"user","content":"first prompt"}}',
      '{"type":"message","message":{"role":"assistant","content":"answer"}}',
    ]);
    await expect(sessionHasAssistantMessages(sessionFile)).resolves.toBe(true);
  });
});

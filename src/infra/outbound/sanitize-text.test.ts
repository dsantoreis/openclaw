import { describe, expect, it } from "vitest";
import { isPlainTextSurface, sanitizeForPlainText, stripInternalTraces } from "./sanitize-text.js";

// ---------------------------------------------------------------------------
// isPlainTextSurface
// ---------------------------------------------------------------------------

describe("isPlainTextSurface", () => {
  it.each(["whatsapp", "signal", "sms", "irc", "telegram", "imessage", "googlechat"])(
    "returns true for %s",
    (channel) => {
      expect(isPlainTextSurface(channel)).toBe(true);
    },
  );

  it.each(["discord", "slack", "web", "matrix"])("returns false for %s", (channel) => {
    expect(isPlainTextSurface(channel)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isPlainTextSurface("WhatsApp")).toBe(true);
    expect(isPlainTextSurface("SIGNAL")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sanitizeForPlainText
// ---------------------------------------------------------------------------

describe("sanitizeForPlainText", () => {
  // --- line breaks --------------------------------------------------------

  it("converts <br> to newline", () => {
    expect(sanitizeForPlainText("hello<br>world")).toBe("hello\nworld");
  });

  it("converts self-closing <br/> and <br /> variants", () => {
    expect(sanitizeForPlainText("a<br/>b")).toBe("a\nb");
    expect(sanitizeForPlainText("a<br />b")).toBe("a\nb");
  });

  // --- inline formatting --------------------------------------------------

  it("converts <b> and <strong> to WhatsApp bold", () => {
    expect(sanitizeForPlainText("<b>bold</b>")).toBe("*bold*");
    expect(sanitizeForPlainText("<strong>bold</strong>")).toBe("*bold*");
  });

  it("converts <i> and <em> to WhatsApp italic", () => {
    expect(sanitizeForPlainText("<i>italic</i>")).toBe("_italic_");
    expect(sanitizeForPlainText("<em>italic</em>")).toBe("_italic_");
  });

  it("converts <s>, <strike>, and <del> to WhatsApp strikethrough", () => {
    expect(sanitizeForPlainText("<s>deleted</s>")).toBe("~deleted~");
    expect(sanitizeForPlainText("<del>removed</del>")).toBe("~removed~");
    expect(sanitizeForPlainText("<strike>old</strike>")).toBe("~old~");
  });

  it("converts <code> to backtick wrapping", () => {
    expect(sanitizeForPlainText("<code>foo()</code>")).toBe("`foo()`");
  });

  // --- block elements -----------------------------------------------------

  it("converts <p> and <div> to newlines", () => {
    expect(sanitizeForPlainText("<p>paragraph</p>")).toBe("\nparagraph\n");
  });

  it("converts headings to bold text with newlines", () => {
    expect(sanitizeForPlainText("<h1>Title</h1>")).toBe("\n*Title*\n");
    expect(sanitizeForPlainText("<h3>Section</h3>")).toBe("\n*Section*\n");
  });

  it("converts <li> to bullet points", () => {
    expect(sanitizeForPlainText("<li>item one</li><li>item two</li>")).toBe(
      "• item one\n• item two\n",
    );
  });

  // --- tag stripping ------------------------------------------------------

  it("strips unknown/remaining tags", () => {
    expect(sanitizeForPlainText('<span class="x">text</span>')).toBe("text");
    expect(sanitizeForPlainText('<a href="https://example.com">link</a>')).toBe("link");
  });

  it("preserves angle-bracket autolinks", () => {
    expect(sanitizeForPlainText("See <https://example.com/path?q=1> now")).toBe(
      "See https://example.com/path?q=1 now",
    );
  });

  // --- passthrough --------------------------------------------------------

  it("passes through clean text unchanged", () => {
    expect(sanitizeForPlainText("hello world")).toBe("hello world");
  });

  it("does not corrupt angle brackets in prose", () => {
    // `a < b` does not match `<tag>` pattern because there is no closing `>`
    // immediately after a tag-like sequence.
    expect(sanitizeForPlainText("a < b && c > d")).toBe("a < b && c > d");
  });

  // --- mixed content ------------------------------------------------------

  it("handles mixed HTML content", () => {
    const input = "Hello<br><b>world</b> this is <i>nice</i>";
    expect(sanitizeForPlainText(input)).toBe("Hello\n*world* this is _nice_");
  });

  it("collapses excessive newlines", () => {
    expect(sanitizeForPlainText("a<br><br><br><br>b")).toBe("a\n\nb");
  });
});

// ---------------------------------------------------------------------------
// stripInternalTraces
// ---------------------------------------------------------------------------

describe("stripInternalTraces", () => {
  it("returns null for a bare tool-routing line", () => {
    expect(stripInternalTraces('to=functions.memory_search args={"query":"test"}')).toBeNull();
  });

  it("returns null for 'commentary' on its own line", () => {
    expect(stripInternalTraces("commentary")).toBeNull();
  });

  it("returns null for 'recipient_name' on its own", () => {
    expect(stripInternalTraces("recipient_name")).toBeNull();
  });

  it("returns null for 'parameters' on its own", () => {
    expect(stripInternalTraces("parameters")).toBeNull();
  });

  it("returns null for bare JSON that looks like tool arguments", () => {
    expect(stripInternalTraces('{"query":"weather today","maxResults":5}')).toBeNull();
  });

  it("does not suppress long JSON (>= 500 chars)", () => {
    const longJson = `{"query":"${"x".repeat(500)}"}`;
    expect(stripInternalTraces(longJson)).toBe(longJson);
  });

  it("strips tool-routing lines from multi-line text and keeps the rest", () => {
    const input = "Hello\nto=functions.memory_search args={}\nWorld";
    expect(stripInternalTraces(input)).toBe("Hello\n\nWorld");
  });

  it("passes through normal text unchanged", () => {
    const text = "Here is a helpful answer about commentary in music.";
    expect(stripInternalTraces(text)).toBe(text);
  });

  it("passes through empty/falsy input", () => {
    expect(stripInternalTraces("")).toBe("");
    expect(stripInternalTraces(undefined as unknown as string)).toBeUndefined();
  });

  it("does not suppress JSON that doesn't match tool-argument keys", () => {
    const userJson = '{"message":"hello","count":42}';
    expect(stripInternalTraces(userJson)).toBe(userJson);
  });

  it("collapses excessive newlines after stripping", () => {
    const input = "Hello\n\nto=functions.foo bar\n\n\nWorld";
    const result = stripInternalTraces(input);
    expect(result).not.toContain("\n\n\n");
  });
});

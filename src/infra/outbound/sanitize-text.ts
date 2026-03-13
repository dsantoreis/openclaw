/**
 * Sanitize model output for plain-text messaging surfaces.
 *
 * LLMs occasionally produce HTML tags (`<br>`, `<b>`, `<i>`, etc.) that render
 * correctly on web but appear as literal text on WhatsApp, Signal, SMS, and IRC.
 *
 * Converts common inline HTML to lightweight-markup equivalents used by
 * WhatsApp/Signal/Telegram and strips any remaining tags.
 *
 * @see https://github.com/openclaw/openclaw/issues/31884
 * @see https://github.com/openclaw/openclaw/issues/18558
 */

/** Channels where HTML tags should be converted/stripped. */
const PLAIN_TEXT_SURFACES = new Set([
  "whatsapp",
  "signal",
  "sms",
  "irc",
  "telegram",
  "imessage",
  "googlechat",
]);

/** Returns `true` when the channel cannot render raw HTML. */
export function isPlainTextSurface(channelId: string): boolean {
  return PLAIN_TEXT_SURFACES.has(channelId.toLowerCase());
}

/**
 * Matches lines that carry internal LLM tool-routing artifacts.
 * These patterns leak from models that emit OpenAI-style function-call routing
 * directives or similar internal metadata directly in their text output.
 *
 * @see https://github.com/openclaw/openclaw/issues/44905
 */
const TOOL_ROUTING_LINE_RE =
  /^(?:to=functions\.\S+.*|commentary\s*$|recipient_name\s*$|parameters\s*$)/m;

/**
 * Matches bare JSON that looks like leaked tool arguments rather than
 * user-facing content. Only matches short blobs (<500 chars) starting with
 * typical tool-argument keys to avoid stripping intentional JSON in replies.
 */
const BARE_TOOL_JSON_RE =
  /^\s*\{\s*"(?:query|maxResults|tool_name|function_call|name|action|parameters)"\s*:/;

/**
 * Strip internal LLM tool-routing traces from outbound text.
 *
 * This runs for **all** channels (not just plain-text surfaces) to prevent
 * tool-call artifacts from reaching end-users on Discord, Slack, etc.
 *
 * Returns `null` when the entire message is an internal trace that should be
 * suppressed, or the cleaned text otherwise.
 */
export function stripInternalTraces(text: string): string | null {
  if (!text) {
    return text;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }
  // Suppress messages that are entirely a tool-routing line.
  if (TOOL_ROUTING_LINE_RE.test(trimmed) && trimmed.split("\n").length <= 2) {
    return null;
  }
  // Suppress short bare JSON blobs that look like leaked tool arguments.
  if (BARE_TOOL_JSON_RE.test(trimmed) && trimmed.length < 500) {
    return null;
  }
  // Strip individual tool-routing lines from multi-line text.
  const cleaned = text
    .replace(/^to=functions\.\S+.*$/gm, "")
    .replace(/^commentary\s*$/gm, "")
    .replace(/^recipient_name\s*$/gm, "")
    .replace(/^parameters\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || null;
}

/**
 * Convert common HTML tags to their plain-text/lightweight-markup equivalents
 * and strip anything that remains.
 *
 * The function is intentionally conservative — it only targets tags that models
 * are known to produce and avoids false positives on angle brackets in normal
 * prose (e.g. `a < b`).
 */
export function sanitizeForPlainText(text: string): string {
  return (
    text
      // Preserve angle-bracket autolinks as plain URLs before tag stripping.
      .replace(/<((?:https?:\/\/|mailto:)[^<>\s]+)>/gi, "$1")
      // Line breaks
      .replace(/<br\s*\/?>/gi, "\n")
      // Block elements → newlines
      .replace(/<\/?(p|div)>/gi, "\n")
      // Bold → WhatsApp/Signal bold
      .replace(/<(b|strong)>(.*?)<\/\1>/gi, "*$2*")
      // Italic → WhatsApp/Signal italic
      .replace(/<(i|em)>(.*?)<\/\1>/gi, "_$2_")
      // Strikethrough → WhatsApp/Signal strikethrough
      .replace(/<(s|strike|del)>(.*?)<\/\1>/gi, "~$2~")
      // Inline code
      .replace(/<code>(.*?)<\/code>/gi, "`$1`")
      // Headings → bold text with newline
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n*$1*\n")
      // List items → bullet points
      .replace(/<li[^>]*>(.*?)<\/li>/gi, "• $1\n")
      // Strip remaining HTML tags (require tag-like structure: <word...>)
      .replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, "")
      // Collapse 3+ consecutive newlines into 2
      .replace(/\n{3,}/g, "\n\n")
  );
}

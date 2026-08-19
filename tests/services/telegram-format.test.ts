import { describe, it, expect } from "vitest";
import { mdToHtml, htmlToPlain, sanitizeKeyboard } from "@/lib/services/telegram";

describe("mdToHtml", () => {
  it("escapes HTML before interpreting Markdown", () => {
    expect(mdToHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders bold, italic and strikethrough", () => {
    expect(mdToHtml("**due Friday**")).toBe("<b>due Friday</b>");
    expect(mdToHtml("__also bold__")).toBe("<b>also bold</b>");
    expect(mdToHtml("a *stressed* word")).toBe("a <i>stressed</i> word");
    expect(mdToHtml("~~dropped~~")).toBe("<s>dropped</s>");
  });

  it("leaves identifiers and arithmetic alone", () => {
    expect(mdToHtml("read snake_case_guide")).toBe("read snake_case_guide");
    expect(mdToHtml("3 * 4 * 5")).toBe("3 * 4 * 5");
  });

  it("converts headers and bullets to Telegram equivalents", () => {
    expect(mdToHtml("## Today")).toBe("<b>Today</b>");
    expect(mdToHtml("- milk\n- eggs")).toBe("• milk\n• eggs");
  });

  it("protects code spans from emphasis rules", () => {
    expect(mdToHtml("`a_b_c`")).toBe("<code>a_b_c</code>");
    expect(mdToHtml("use `**not bold**` here")).toBe("use <code>**not bold**</code> here");
  });

  it("does not mistake a plain number for a parked code span", () => {
    expect(mdToHtml("you have 3 tasks and `code` left")).toBe("you have 3 tasks and <code>code</code> left");
  });

  it("renders links", () => {
    expect(mdToHtml("[docs](https://example.com)")).toBe('<a href="https://example.com">docs</a>');
  });

  it("never emits badly-nested tags when emphasis markers cross", () => {
    // <b>bold <i>italic</b> end</i> is Telegram's canonical "invalid entities" case: it 400s,
    // and the plain-text retry then showed the user the raw tags.
    const out = mdToHtml("**bold *italic** end*");
    expect(out).toBe("<b>bold *italic</b> end*");
    expect(out).not.toMatch(/<i>[^<]*<\/b>/);
  });

  it("keeps tags balanced for the mixed-emphasis shapes a model actually writes", () => {
    for (const input of ["**Remember, *don't* forget**", "*a **b** c*", "**a *b* c**"]) {
      const tags = [...mdToHtml(input).matchAll(/<(\/?)([a-z]+)[^>]*>/g)].map(([, slash, tag]) => `${slash}${tag}`);
      const stack: string[] = [];
      for (const tag of tags) {
        if (tag.startsWith("/")) expect(stack.pop()).toBe(tag.slice(1));
        else stack.push(tag);
      }
      expect(stack).toEqual([]);
    }
  });

  it("strips literal sentinel codepoints instead of splicing in parked spans", () => {
    expect(mdToHtml("note 5 done")).toBe("note 5 done");
    expect(mdToHtml("call `foo()` then 0 rest")).toBe("call <code>foo()</code> then 0 rest");
  });

  it("treats an unclosed code fence as code rather than leaking backticks", () => {
    const out = mdToHtml("```js\nx = *a\nthen **bold** here");
    expect(out).toContain("<pre>");
    expect(out).not.toContain("```");
    expect(out).not.toContain("<b>");
  });
});

describe("htmlToPlain", () => {
  it("strips tags and restores entities", () => {
    expect(htmlToPlain("<b>Buy milk</b>")).toBe("Buy milk");
    expect(htmlToPlain("a &lt; b &amp; c")).toBe("a < b & c");
  });

  it("round-trips model text through mdToHtml without leaving markup", () => {
    expect(htmlToPlain(mdToHtml("**Created:** buy milk"))).toBe("Created: buy milk");
  });

  it("unescapes ampersands last so &amp;lt; survives as &lt;", () => {
    expect(htmlToPlain("&amp;lt;")).toBe("&lt;");
  });
});

describe("sanitizeKeyboard", () => {
  it("drops buttons whose callback_data exceeds Telegram's 64-byte cap", () => {
    const keyboard = [
      [
        { text: "ok", callback_data: "d:" + "a".repeat(30) },
        { text: "too long", callback_data: "d:" + "a".repeat(80) },
      ],
    ];
    expect(sanitizeKeyboard(keyboard)).toEqual([[{ text: "ok", callback_data: "d:" + "a".repeat(30) }]]);
  });

  it("removes rows left empty and keeps a real uuid payload", () => {
    expect(sanitizeKeyboard([[{ text: "x", callback_data: "d:" + "a".repeat(80) }]])).toEqual([]);
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(sanitizeKeyboard([[{ text: "1h", callback_data: `s:${uuid}:60` }]])).toHaveLength(1);
  });
});

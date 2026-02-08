import { describe, expect, it } from "vitest";
import { XmlSaxParser } from "../../src/index";
import { collectEvents } from "../helpers";

describe("streaming behavior", () => {
  it("emits events during feed", () => {
    const events: string[] = [];
    const parser = new XmlSaxParser({
      onOpenTag: (tag) => events.push(`open:${tag.name}`),
      onCloseTag: (tag) => events.push(`close:${tag.name}`)
    });

    parser.feed("<root><a>");
    expect(events).toEqual(["open:root", "open:a"]);

    parser.feed("ok</a></root>");
    parser.close();
  });

  it("handles entities across chunk boundaries", () => {
    const texts: string[] = [];
    const parser = new XmlSaxParser({
      onText: (text) => texts.push(text)
    });

    parser.feed("<root>Hi &amp");
    parser.feed("; there</root>");
    parser.close();

    expect(texts.join("")).toBe("Hi & there");
  });

  it("matches single-feed events at byte boundaries", () => {
    const xml = "<root><a>ok</a><b/></root>";
    const single = collectEvents(xml);
    const boundary = collectEvents(xml, 1);
    expect(boundary).toEqual(single);
  });
});

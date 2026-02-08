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

  it("handles chunked markup sections", () => {
    const events: string[] = [];
    const parser = new XmlSaxParser({
      onComment: (text) => events.push(`comment:${text}`),
      onCdata: (text) => events.push(`cdata:${text}`),
      onProcessingInstruction: (pi) => events.push(`pi:${pi.target}:${pi.body}`),
      onDoctype: (dt) => events.push(`doctype:${dt.raw}`),
      onOpenTag: (tag) => events.push(`open:${tag.name}`),
      onCloseTag: (tag) => events.push(`close:${tag.name}`)
    });

    const chunks = [
      "<?",
      "xml version='1.0'?>",
      "<!DOC",
      "TYPE root>",
      "<root><!--co",
      "mment--><![CDATA[te",
      "xt]]><?pi data?></root>"
    ];

    for (const chunk of chunks) {
      parser.feed(chunk);
    }
    parser.close();

    expect(events).toEqual([
      "pi:xml:version='1.0'",
      "doctype:root",
      "open:root",
      "comment:comment",
      "cdata:text",
      "pi:pi:data",
      "close:root"
    ]);
  });
});

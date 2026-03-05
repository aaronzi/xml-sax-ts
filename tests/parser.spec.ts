import { describe, expect, it } from "vitest";
import { XmlSaxParser, parseXmlString } from "../src/index";

describe("XmlSaxParser", () => {
  it("parses simple tags", () => {
    const events: string[] = [];
    const parser = new XmlSaxParser({
      onOpenTag: (tag) => events.push(`open:${tag.name}`),
      onCloseTag: (tag) => events.push(`close:${tag.name}`),
      onText: (text) => events.push(`text:${text}`)
    });

    parser.feed("<root>Hello</root>");
    parser.close();

    expect(events).toEqual(["open:root", "text:Hello", "close:root"]);
  });

  it("handles namespaces and attributes", () => {
    const seen: { name: string; uri: string }[] = [];
    const parser = new XmlSaxParser({
      xmlns: true,
      onOpenTag: (tag) => {
        seen.push({ name: tag.name, uri: tag.uri });
        if (tag.name === "a") {
          const attr = tag.attributes["p:id"];
          expect(attr?.uri).toBe("urn:p");
        }
      }
    });

    parser.feed("<a xmlns='urn:a' xmlns:p='urn:p' p:id='1'><p:b/></a>");
    parser.close();

    expect(seen).toEqual([
      { name: "a", uri: "urn:a" },
      { name: "p:b", uri: "urn:p" }
    ]);
  });

  it("emits plain-mode attributes as strings", () => {
    const seenOpen: { attr: string; hasPrefix: boolean; hasLocal: boolean; hasUri: boolean }[] = [];
    const seenClose: { hasPrefix: boolean; hasLocal: boolean; hasUri: boolean }[] = [];
    const parser = new XmlSaxParser({
      xmlns: false,
      onOpenTag: (tag) => {
        if (tag.name === "a") {
          seenOpen.push({
            attr: typeof tag.attributes.x === "string" ? tag.attributes.x : "",
            hasPrefix: "prefix" in tag,
            hasLocal: "local" in tag,
            hasUri: "uri" in tag
          });
        }
      },
      onCloseTag: (tag) => {
        if (tag.name === "a") {
          seenClose.push({
            hasPrefix: "prefix" in tag,
            hasLocal: "local" in tag,
            hasUri: "uri" in tag
          });
        }
      }
    });

    parser.feed("<a x='1'/>");
    parser.close();

    expect(seenOpen).toEqual([{ attr: "1", hasPrefix: false, hasLocal: false, hasUri: false }]);
    expect(seenClose).toEqual([{ hasPrefix: false, hasLocal: false, hasUri: false }]);
  });

  it("parses cdata and entities", () => {
    const events: string[] = [];
    const parser = new XmlSaxParser({
      onCdata: (text) => events.push(`cdata:${text}`),
      onText: (text) => events.push(`text:${text}`)
    });

    parser.feed("<root><![CDATA[<x>]]>&lt;</root>");
    parser.close();

    expect(events).toEqual(["cdata:<x>", "text:<"]);
  });

  it("parses doctype and processing instructions", () => {
    const events: string[] = [];
    const parser = new XmlSaxParser({
      onDoctype: (dt) => events.push(`doctype:${dt.raw}`),
      onProcessingInstruction: (pi) => events.push(`pi:${pi.target}`)
    });

    parser.feed("<?xml version='1.0'?><!DOCTYPE root><root/>");
    parser.close();

    expect(events).toEqual(["pi:xml", "doctype:root"]);
  });

  it("supports streaming chunks", () => {
    const events: string[] = [];
    const parser = new XmlSaxParser({
      onOpenTag: (tag) => events.push(`open:${tag.name}`),
      onCloseTag: (tag) => events.push(`close:${tag.name}`),
      onText: (text) => events.push(`text:${text}`)
    });

    parser.feed("<root><a>hi");
    parser.feed("</a></root>");
    parser.close();

    expect(events).toEqual(["open:root", "open:a", "text:hi", "close:a", "close:root"]);
  });

  it("coalesces adjacent text by default", () => {
    const texts: string[] = [];
    const parser = new XmlSaxParser({
      onText: (text) => texts.push(text)
    });

    parser.feed("<root>a");
    parser.feed("b");
    parser.feed("c</root>");
    parser.close();

    expect(texts).toEqual(["abc"]);
  });

  it("coalesces adjacent text but still flushes at tag boundaries", () => {
    const texts: string[] = [];
    const parser = new XmlSaxParser({
      coalesceText: true,
      onText: (text) => texts.push(text)
    });

    parser.feed("<root>a<b/>c</root>");
    parser.close();

    expect(texts).toEqual(["a", "c"]);
  });

  it("supports self-closing tags with surrounding whitespace", () => {
    const events: string[] = [];
    const parser = new XmlSaxParser({
      onOpenTag: (tag) => events.push(`open:${tag.name}:${String(tag.isSelfClosing)}`),
      onCloseTag: (tag) => events.push(`close:${tag.name}`)
    });

    parser.feed("<root><a x='1' /></root>");
    parser.close();

    expect(events).toEqual(["open:root:false", "open:a:true", "close:a", "close:root"]);
  });

  it("rejects invalid self-closing syntax", () => {
    const parser = new XmlSaxParser();
    expect(() => {
      parser.feed("<root><a / x='1'></a></root>");
      parser.close();
    }).toThrow();
  });
});

describe("parseXmlString", () => {
  it("builds a tree", () => {
    const root = parseXmlString("<root><a>1</a><b/></root>");
    expect(root.name).toBe("root");
    expect(root.children?.length).toBe(2);
  });
});

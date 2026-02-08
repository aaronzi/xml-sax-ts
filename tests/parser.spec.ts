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
});

describe("parseXmlString", () => {
  it("builds a tree", () => {
    const root = parseXmlString("<root><a>1</a><b/></root>");
    expect(root.name).toBe("root");
    expect(root.children?.length).toBe(2);
  });
});

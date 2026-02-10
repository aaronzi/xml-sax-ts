import { describe, expect, it } from "vitest";
import {
  ObjectBuilder,
  XmlSaxParser,
  buildObject,
  buildXmlNode,
  objectToXml,
  parseXmlString,
  serializeXml,
  stripNamespace
} from "../src/index";

describe("buildObject", () => {
  it("projects attributes and text", () => {
    const root = parseXmlString("<root id='1'>Hello</root>");
    const obj = buildObject(root);

    expect(obj).toEqual({ "@_id": "1", "#text": "Hello" });
  });

  it("coalesces repeated elements into arrays", () => {
    const root = parseXmlString("<root><item>1</item><item>2</item></root>");
    const obj = buildObject(root);

    expect(obj).toEqual({ item: ["1", "2"] });
  });

  it("supports forced array elements", () => {
    const root = parseXmlString("<root><item>1</item></root>");
    const obj = buildObject(root, { arrayElements: new Set(["item"]) });

    expect(obj).toEqual({ item: ["1"] });
  });

  it("handles mixed content and namespaces", () => {
    const xml = "<p:root xmlns:p='urn:p'>Hi <p:child>there</p:child>!</p:root>";
    const root = parseXmlString(xml);
    const obj = buildObject(root, { stripNamespaces: true });

    expect(obj).toEqual({ child: "there", "#text": "Hi !" });
  });
});

describe("ObjectBuilder", () => {
  it("builds the same shape while streaming", () => {
    const builder = new ObjectBuilder();
    const parser = new XmlSaxParser({
      onOpenTag: builder.onOpenTag,
      onText: builder.onText,
      onCdata: builder.onCdata,
      onCloseTag: builder.onCloseTag
    });

    parser.feed("<root><item>1</item>");
    parser.feed("<item>2</item></root>");
    parser.close();

    expect(builder.getResult()).toEqual({ item: ["1", "2"] });
  });
});

describe("stripNamespace", () => {
  it("returns local names", () => {
    expect(stripNamespace("p:node")).toBe("node");
    expect(stripNamespace("node")).toBe("node");
  });
});

describe("buildXmlNode", () => {
  it("maps attributes and text", () => {
    const node = buildXmlNode({ root: { "@_id": "1", "#text": "Hello" } });

    expect(serializeXml(node)).toBe("<root id=\"1\">Hello</root>");
  });

  it("creates repeated elements from arrays", () => {
    const node = buildXmlNode({ root: { item: ["1", "2"] } });

    expect(serializeXml(node)).toBe("<root><item>1</item><item>2</item></root>");
  });

  it("supports mixed content arrays", () => {
    const node = buildXmlNode({ root: ["Hi ", { child: "there" }, "!"] });

    expect(serializeXml(node)).toBe("<root>Hi <child>there</child>!</root>");
  });

  it("strips namespaces when requested", () => {
    const node = buildXmlNode(
      { "p:root": { "@_p:id": "1", "p:child": "value" } },
      { stripNamespaces: true }
    );

    expect(serializeXml(node)).toBe("<root id=\"1\"><child>value</child></root>");
  });

  it("uses rootName when object has multiple keys", () => {
    const node = buildXmlNode({ a: "1", b: "2" }, { rootName: "root" });

    expect(serializeXml(node)).toBe("<root><a>1</a><b>2</b></root>");
  });
});

describe("objectToXml", () => {
  it("serializes via buildXmlNode", () => {
    const xml = objectToXml({ root: { item: ["1", "2"] } });

    expect(xml).toBe("<root><item>1</item><item>2</item></root>");
  });
});

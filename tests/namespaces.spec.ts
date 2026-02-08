import { describe, expect, it } from "vitest";
import { XmlSaxError, XmlSaxParser } from "../src/index";

const XML_NAMESPACE_URI = "http://www.w3.org/XML/1998/namespace";

function captureError(run: () => void): XmlSaxError {
  try {
    run();
  } catch (err) {
    return err as XmlSaxError;
  }
  throw new Error("Expected XmlSaxError to be thrown");
}

describe("namespaces", () => {
  it("respects default namespace scope and undeclare", () => {
    const seen: { name: string; uri: string }[] = [];
    let rootAttrUri = "";
    let prefixedAttrUri = "";

    const parser = new XmlSaxParser({
      xmlns: true,
      onOpenTag: (tag) => {
        seen.push({ name: tag.name, uri: tag.uri });
        if (tag.name === "root") {
          rootAttrUri = tag.attributes.a?.uri ?? "";
          prefixedAttrUri = tag.attributes["p:b"]?.uri ?? "";
        }
      }
    });

    parser.feed("<root xmlns='urn:root' xmlns:p='urn:p' a='1' p:b='2'><child xmlns=''><inner/></child></root>");
    parser.close();

    expect(seen).toEqual([
      { name: "root", uri: "urn:root" },
      { name: "child", uri: "" },
      { name: "inner", uri: "" }
    ]);
    expect(rootAttrUri).toBe("");
    expect(prefixedAttrUri).toBe("urn:p");
  });

  it("includes xmlns attributes when requested", () => {
    let attrs: string[] = [];
    const parser = new XmlSaxParser({
      xmlns: true,
      includeNamespaceAttributes: true,
      onOpenTag: (tag) => {
        attrs = Object.keys(tag.attributes);
      }
    });

    parser.feed("<root xmlns='urn:root' xmlns:p='urn:p'/>");
    parser.close();

    expect(attrs).toContain("xmlns");
    expect(attrs).toContain("xmlns:p");
  });

  it("throws on undeclared prefixes", () => {
    const elementError = captureError(() => {
      const parser = new XmlSaxParser({ xmlns: true });
      parser.feed("<p:root/>");
      parser.close();
    });

    const attributeError = captureError(() => {
      const parser = new XmlSaxParser({ xmlns: true });
      parser.feed("<root p:id='1'/>");
      parser.close();
    });

    expect(elementError).toBeInstanceOf(XmlSaxError);
    expect(attributeError).toBeInstanceOf(XmlSaxError);
  });

  it("supports implicit xml prefix", () => {
    let xmlLangUri = "";
    const parser = new XmlSaxParser({
      xmlns: true,
      onOpenTag: (tag) => {
        xmlLangUri = tag.attributes["xml:lang"]?.uri ?? "";
      }
    });

    parser.feed("<root xml:lang='en'/>");
    parser.close();

    expect(xmlLangUri).toBe(XML_NAMESPACE_URI);
  });
});

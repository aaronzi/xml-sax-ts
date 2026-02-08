import { describe, expect, it } from "vitest";
import { XmlSaxParser } from "../src/index";

describe("line ending normalization", () => {
  it("normalizes CRLF and CR in text across chunks", () => {
    const texts: string[] = [];
    const parser = new XmlSaxParser({
      onText: (value) => texts.push(value)
    });

    parser.feed("<root>hi\r");
    parser.feed("\nthere\r");
    parser.feed("ok</root>");
    parser.close();

    expect(texts.join("")).toBe("hi\nthere\nok");
  });

  it("normalizes line endings in attribute values", () => {
    let value = "";
    const parser = new XmlSaxParser({
      onOpenTag: (tag) => {
        value = tag.attributes.a?.value ?? "";
      }
    });

    parser.feed("<root a='x\r\ny\rz'/>");
    parser.close();

    expect(value).toBe("x\ny\nz");
  });
});

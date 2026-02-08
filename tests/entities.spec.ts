import { describe, expect, it } from "vitest";
import { XmlSaxError, XmlSaxParser } from "../src/index";

function captureError(run: () => void): XmlSaxError {
  try {
    run();
  } catch (err) {
    return err as XmlSaxError;
  }
  throw new Error("Expected XmlSaxError to be thrown");
}

describe("entities", () => {
  it("decodes entities in text and attributes", () => {
    let text = "";
    let attr = "";

    const parser = new XmlSaxParser({
      onText: (value) => {
        text += value;
      },
      onOpenTag: (tag) => {
        attr = tag.attributes.a?.value ?? "";
      }
    });

    parser.feed("<root a='&lt; &amp; &#x41; &#65;'>&lt;&amp;&#x41;&#65;</root>");
    parser.close();

    expect(text).toBe("<&AA");
    expect(attr).toBe("< & A A");
  });

  it("throws on unknown entity and reports onError", () => {
    const errors: Error[] = [];
    const parser = new XmlSaxParser({
      onError: (error) => errors.push(error)
    });

    const error = captureError(() => {
      parser.feed("<root>&bogus;</root>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
    expect(errors.length).toBe(1);
  });

  it("throws on invalid numeric entities", () => {
    const outOfRange = captureError(() => {
      const parser = new XmlSaxParser();
      parser.feed("<root>&#x110000;</root>");
      parser.close();
    });

    const surrogate = captureError(() => {
      const parser = new XmlSaxParser();
      parser.feed("<root>&#xD800;</root>");
      parser.close();
    });

    expect(outOfRange).toBeInstanceOf(XmlSaxError);
    expect(surrogate).toBeInstanceOf(XmlSaxError);
  });

  it("throws on unterminated entities", () => {
    const error = captureError(() => {
      const parser = new XmlSaxParser();
      parser.feed("<root>&amp</root>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
  });
});

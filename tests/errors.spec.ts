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

describe("error handling", () => {
  it("reports mismatched closing tag positions", () => {
    const parser = new XmlSaxParser();
    const error = captureError(() => {
      parser.feed("<root>\n</rot>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
    expect(error.line).toBe(2);
    expect(error.column).toBe(1);
    expect(error.offset).toBe(7);
  });

  it("throws on closing tag without a start tag", () => {
    const parser = new XmlSaxParser();
    const error = captureError(() => {
      parser.feed("</root>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
  });

  it("rejects unterminated markup", () => {
    const cases = [
      "<!--",
      "<![CDATA[",
      "<?pi",
      "<!DOCTYPE root",
      "<root"
    ];

    for (const xml of cases) {
      const parser = new XmlSaxParser();
      const error = captureError(() => {
        parser.feed(xml);
        parser.close();
      });
      expect(error).toBeInstanceOf(XmlSaxError);
    }
  });

  it("rejects unquoted attribute values", () => {
    const parser = new XmlSaxParser();
    const error = captureError(() => {
      parser.feed("<root a=1/>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
  });

  it("blocks doctype when disallowed", () => {
    const parser = new XmlSaxParser({ allowDoctype: false });
    const error = captureError(() => {
      parser.feed("<!DOCTYPE root><root/>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
  });
});

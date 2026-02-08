import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectEvents } from "../helpers";

const fixturesDir = join(process.cwd(), "tests", "fixtures");
const fixtures = ["basic.xml", "namespaces.xml", "mixed.xml", "doctype.xml"];

describe("fixtures", () => {
  it("parses fixtures consistently in one pass", () => {
    for (const file of fixtures) {
      const xml = readFileSync(join(fixturesDir, file), "utf8");
      const single = collectEvents(xml);
      const chunked = collectEvents(xml, 7);
      expect(chunked).toEqual(single);
    }
  });
});

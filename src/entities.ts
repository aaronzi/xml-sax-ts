import { XmlSaxError } from "./errors";

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: "\"",
  apos: "'"
};

export function decodeEntities(input: string, onError?: (error: Error) => void): string {
  let output = "";
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (ch !== "&") {
      output += ch;
      i += 1;
      continue;
    }

    const semi = input.indexOf(";", i + 1);
    if (semi === -1) {
      const err = new XmlSaxError("Unterminated entity", i, 0, 0);
      onError?.(err);
      throw err;
    }

    const entity = input.slice(i + 1, semi);
    let decoded: string | undefined;

    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      decoded = Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : undefined;
    } else if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      decoded = Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : undefined;
    } else {
      decoded = NAMED_ENTITIES[entity];
    }

    if (decoded === undefined) {
      const err = new XmlSaxError(`Unknown entity: &${entity};`, i, 0, 0);
      onError?.(err);
      throw err;
    }

    output += decoded;
    i = semi + 1;
  }

  return output;
}

export function splitTextForEntities(text: string): { emit: string; carry: string } {
  const lastAmp = text.lastIndexOf("&");
  if (lastAmp === -1) {
    return { emit: text, carry: "" };
  }

  const nextSemi = text.indexOf(";", lastAmp + 1);
  if (nextSemi === -1) {
    return {
      emit: text.slice(0, lastAmp),
      carry: text.slice(lastAmp)
    };
  }

  return { emit: text, carry: "" };
}

import { XmlSaxError } from "./errors";

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: "\"",
  apos: "'"
};

export function decodeEntities(input: string, onError?: (error: Error) => void): string {
  const firstAmp = input.indexOf("&");
  if (firstAmp === -1) {
    return input;
  }

  const parts: string[] = [];
  let i = 0;

  while (i < input.length) {
    const amp = input.indexOf("&", i);
    if (amp === -1) {
      if (i < input.length) {
        parts.push(input.slice(i));
      }
      break;
    }

    if (amp > i) {
      parts.push(input.slice(i, amp));
    }

    const semi = input.indexOf(";", amp + 1);
    if (semi === -1) {
      const err = new XmlSaxError("Unterminated entity", amp, 0, 0);
      onError?.(err);
      throw err;
    }

    const entity = input.slice(amp + 1, semi);
    let decoded: string | undefined;

    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      decoded = decodeCodePoint(codePoint);
    } else if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      decoded = decodeCodePoint(codePoint);
    } else {
      decoded = NAMED_ENTITIES[entity];
    }

    if (decoded === undefined) {
      const err = new XmlSaxError(`Unknown entity: &${entity};`, amp, 0, 0);
      onError?.(err);
      throw err;
    }

    parts.push(decoded);
    i = semi + 1;
  }

  return parts.join("");
}

function decodeCodePoint(codePoint: number): string | undefined {
  if (!Number.isFinite(codePoint)) {
    return undefined;
  }
  if (codePoint < 0 || codePoint > 0x10ffff) {
    return undefined;
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return undefined;
  }
  return String.fromCodePoint(codePoint);
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

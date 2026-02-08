import { XmlSaxParser } from "../src/index";

export function collectEventsFromChunks(chunks: string[]): string[] {
  const events: string[] = [];
  const pushText = (text: string): void => {
    if (!text) {
      return;
    }
    const last = events[events.length - 1];
    if (last?.startsWith("text:")) {
      events[events.length - 1] = `text:${last.slice(5)}${text}`;
      return;
    }
    events.push(`text:${text}`);
  };

  const parser = new XmlSaxParser({
    onOpenTag: (tag) => events.push(`open:${tag.name}`),
    onCloseTag: (tag) => events.push(`close:${tag.name}`),
    onText: pushText,
    onCdata: (text) => events.push(`cdata:${text}`),
    onProcessingInstruction: (pi) => events.push(`pi:${pi.target}:${pi.body}`),
    onDoctype: (dt) => events.push(`doctype:${dt.raw}`),
    onComment: (text) => events.push(`comment:${text}`)
  });

  for (const chunk of chunks) {
    parser.feed(chunk);
  }
  parser.close();

  return events;
}

export function collectEvents(xml: string, chunkSize?: number): string[] {
  if (!chunkSize || chunkSize <= 0) {
    return collectEventsFromChunks([xml]);
  }

  const chunks: string[] = [];
  for (let i = 0; i < xml.length; i += chunkSize) {
    chunks.push(xml.slice(i, i + chunkSize));
  }

  return collectEventsFromChunks(chunks);
}

export function chunkBySizes(input: string, sizes: number[]): string[] {
  const chunks: string[] = [];
  let offset = 0;

  for (const size of sizes) {
    const safeSize = Math.max(0, size);
    if (safeSize === 0) {
      continue;
    }
    if (offset >= input.length) {
      break;
    }
    chunks.push(input.slice(offset, offset + safeSize));
    offset += safeSize;
  }

  if (offset < input.length) {
    chunks.push(input.slice(offset));
  }

  return chunks;
}

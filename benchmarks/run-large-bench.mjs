import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";
import { XmlSaxParser, CloseTagToken, OpenTagToken, TextToken } from "../dist/index.js";

const BLOB_SIZE_MB = Number.parseInt(process.env.LARGE_BLOB_SIZE_MB ?? "250", 10);
const BLOB_COUNT = Number.parseInt(process.env.LARGE_BLOB_COUNT ?? "10", 10);
const CHUNK_SIZE_MB = Number.parseInt(process.env.LARGE_XML_CHUNK_MB ?? "1", 10);
const REGENERATE = process.env.LARGE_XML_REGENERATE === "1";
const XMLNS = process.env.LARGE_XML_XMLNS === "1";
const COALESCE_TEXT = process.env.LARGE_XML_COALESCE_TEXT === "1";

const fileName = `xml-sax-ts-large-${BLOB_COUNT}x${BLOB_SIZE_MB}mb.xml`;
const outputDir = path.join(os.tmpdir(), "xml-sax-ts-bench");
const outputPath = process.env.LARGE_XML_FILE ?? path.join(outputDir, fileName);

const CHUNK_BYTES = CHUNK_SIZE_MB * 1024 * 1024;
const BLOB_BYTES = BLOB_SIZE_MB * 1024 * 1024;

function formatNumber(value, digits = 2) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) {
    return `${formatNumber(mb, 1)} MB`;
  }
  return `${formatNumber(mb / 1024, 2)} GB`;
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

async function writeWithBackpressure(stream, value) {
  if (stream.write(value)) {
    return;
  }
  await once(stream, "drain");
}

async function generateLargeXml(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });

  const stream = createWriteStream(filePath, { encoding: "utf8" });
  const payload = "A".repeat(CHUNK_BYTES);
  const chunksPerBlob = Math.floor(BLOB_BYTES / CHUNK_BYTES);
  const lastChunkBytes = BLOB_BYTES % CHUNK_BYTES;
  const tail = lastChunkBytes > 0 ? "A".repeat(lastChunkBytes) : "";

  await writeWithBackpressure(stream, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<root>\n");

  for (let i = 0; i < BLOB_COUNT; i += 1) {
    await writeWithBackpressure(stream, `<item id="${i + 1}"><blob>`);
    for (let n = 0; n < chunksPerBlob; n += 1) {
      await writeWithBackpressure(stream, payload);
    }
    if (tail) {
      await writeWithBackpressure(stream, tail);
    }
    await writeWithBackpressure(stream, "</blob></item>\n");
  }

  await writeWithBackpressure(stream, "</root>\n");
  stream.end();
  await once(stream, "finish");
}

function consume(tokens, stats) {
  for (const token of tokens) {
    if (token instanceof OpenTagToken) {
      stats.openTags += 1;
      continue;
    }
    if (token instanceof CloseTagToken) {
      stats.closeTags += 1;
      continue;
    }
    if (token instanceof TextToken) {
      stats.textChars += token.text.length;
    }
  }
}

async function parseLargeXml(filePath) {
  const parser = new XmlSaxParser({ xmlns: XMLNS, coalesceText: COALESCE_TEXT, trackPosition: false });
  const decoder = new TextDecoder("utf-8");
  const stream = createReadStream(filePath, { highWaterMark: CHUNK_BYTES });
  const stats = {
    openTags: 0,
    closeTags: 0,
    textChars: 0,
    peakRssBytes: process.memoryUsage().rss
  };

  const startMs = nowMs();

  for await (const chunk of stream) {
    const decoded = decoder.decode(chunk, { stream: true });
    consume(parser.feed(decoded), stats);
    const rss = process.memoryUsage().rss;
    if (rss > stats.peakRssBytes) {
      stats.peakRssBytes = rss;
    }
  }

  const finalChunk = decoder.decode();
  if (finalChunk) {
    consume(parser.feed(finalChunk), stats);
  }
  consume(parser.close(), stats);

  const elapsedMs = nowMs() - startMs;
  return { ...stats, elapsedMs };
}

async function main() {
  const expectedSize = BLOB_SIZE_MB * BLOB_COUNT * 1024 * 1024;
  const hasFile = existsSync(outputPath);

  console.log("Large XML benchmark (Node)");
  console.log(`Target dataset: ${BLOB_COUNT} blobs x ${BLOB_SIZE_MB} MB = ${formatBytes(expectedSize)}`);
  console.log(`Parser settings: xmlns=${String(XMLNS)} coalesceText=${String(COALESCE_TEXT)} trackPosition=false`);
  console.log(`I/O chunk size: ${CHUNK_SIZE_MB} MB`);
  console.log(`Dataset path: ${outputPath}`);

  if (!hasFile || REGENERATE) {
    const genStart = nowMs();
    console.log("Generating dataset...");
    await generateLargeXml(outputPath);
    console.log(`Generated in ${formatNumber((nowMs() - genStart) / 1000, 2)} s`);
  }

  const fileSize = statSync(outputPath).size;
  console.log(`Dataset size on disk: ${formatBytes(fileSize)}`);

  const result = await parseLargeXml(outputPath);
  const seconds = result.elapsedMs / 1000;
  const throughput = fileSize / (1024 * 1024) / seconds;

  console.log("\nResults");
  console.log(`Elapsed: ${formatNumber(seconds, 2)} s`);
  console.log(`Throughput: ${formatNumber(throughput, 2)} MB/s`);
  console.log(`Open tags: ${formatNumber(result.openTags, 0)}`);
  console.log(`Close tags: ${formatNumber(result.closeTags, 0)}`);
  console.log(`Text chars: ${formatNumber(result.textChars, 0)}`);
  console.log(`Peak RSS: ${formatBytes(result.peakRssBytes)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

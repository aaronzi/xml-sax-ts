# xml-sax-ts

[![npm version](https://img.shields.io/npm/v/xml-sax-ts?color=blue)](https://www.npmjs.com/package/xml-sax-ts)
[![license](https://img.shields.io/npm/l/xml-sax-ts)](./LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/xml-sax-ts)](https://bundlephobia.com/package/xml-sax-ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)

> One-pass, streaming (SAX-style) XML parser for TypeScript — works in Node.js and browsers.

## Highlights

- **Streaming** — feed chunks of XML as they arrive; no need to buffer the whole document
- **Lightweight** — zero runtime dependencies, tree-shakeable ESM + CJS
- **Type-safe** — written in TypeScript with full type exports
- **Namespace-aware** — resolves prefixes, URIs, and local names out of the box
- **Two-way** — parse XML to a tree (`parseXmlString`) or serialize a tree back to XML (`serializeXml`)
- **Design-by-contract** — invariant checks in development, stripped in production

## Install

```bash
npm install xml-sax-ts
```

## Quick start

### Token streaming (sync)

```ts
import { CloseTagToken, OpenTagToken, TextToken, XmlSaxParser } from "xml-sax-ts";

const parser = new XmlSaxParser();

for (const token of parser.feed("<root>")) {
  if (token instanceof OpenTagToken) console.log("open", token.tag.name);
}
for (const token of parser.feed("Hello</root>")) {
  if (token instanceof TextToken) console.log("text", token.text);
  if (token instanceof CloseTagToken) console.log("close", token.tag.name);
}
parser.close();
```

### Token streaming (async)

```ts
import { OpenTagToken, tokenizeXmlAsync } from "xml-sax-ts";

async function* chunks(): AsyncGenerator<string> {
  yield "<root><item>1</item>";
  yield "<item>2</item></root>";
}

for await (const token of tokenizeXmlAsync(chunks())) {
  if (token instanceof OpenTagToken) {
    console.log(token.depth, token.path.join("/"));
  }
}
```

### Parse to tree

```ts
import { parseXmlString } from "xml-sax-ts";

const root = parseXmlString("<root><a>1</a><b/></root>");
console.log(root.name); // "root"
```

### Project to plain objects

```ts
import { buildObject, parseXmlString } from "xml-sax-ts";

const root = parseXmlString("<root id='1'><item>1</item><item>2</item></root>");
const obj = buildObject(root);
// { "@_id": "1", item: ["1", "2"] }
```

### Streaming object builder

```ts
import { CdataToken, CloseTagToken, OpenTagToken, TextToken, ObjectBuilder, XmlSaxParser } from "xml-sax-ts";

const builder = new ObjectBuilder();
const parser = new XmlSaxParser();

const consume = (token: unknown): void => {
  if (
    token instanceof OpenTagToken ||
    token instanceof TextToken ||
    token instanceof CdataToken ||
    token instanceof CloseTagToken
  ) {
    builder.consume(token);
  }
};

for (const token of parser.feed("<root><item>1</item>")) consume(token);
for (const token of parser.feed("<item>2</item></root>")) consume(token);
for (const token of parser.close()) consume(token);

const obj = builder.getResult();
// { item: ["1", "2"] }
```

### Object to XML

```ts
import { objectToXml } from "xml-sax-ts";

const xml = objectToXml({
  root: {
    "@_id": "1",
    item: ["1", "2"],
  }
});

// <root id="1"><item>1</item><item>2</item></root>
```

```ts
import { buildObject, objectToXml, parseXmlString } from "xml-sax-ts";

const root = parseXmlString("<root id='1'><item>1</item></root>");
const obj = buildObject(root);
const xml = objectToXml(obj, { rootName: "root" });

// <root id="1"><item>1</item></root>
```

### Serialize to XML

```ts
import { serializeXml } from "xml-sax-ts";

const xml = serializeXml(
  {
    name: "root",
    attributes: { id: "1" },
    children: ["Hello", { name: "child", children: ["World"] }],
  },
  { pretty: true, xmlDeclaration: true },
);
// <?xml version="1.0" encoding="UTF-8"?>
// <root id="1">
//   Hello
//   <child>World</child>
// </root>
```

## Benchmarking

Run the reproducible benchmark harness:

```bash
npm run bench
```

Quick run (fewer rounds):

```bash
npm run bench:quick
```

### Large file streaming benchmark (2.5 GB)

This benchmark parses a synthetic XML document containing 10 large text blobs of 250 MB each.
The parser runs in true streaming mode and does not require building a full tree in memory.

Run in Node:

```bash
npm run bench:large:node
```

Optional smaller smoke run:

```bash
npm run bench:large:node:sample
```

Environment variables for `bench:large:node`:

- `LARGE_BLOB_SIZE_MB` (default `250`)
- `LARGE_BLOB_COUNT` (default `10`)
- `LARGE_XML_CHUNK_MB` (default `1`)
- `LARGE_XML_XMLNS` (`1` enables namespaces; default `false`)
- `LARGE_XML_COALESCE_TEXT` (`1` enables text coalescing; default `false`)
- `LARGE_XML_REGENERATE=1` to rebuild the generated dataset
- `LARGE_XML_FILE` to override the dataset path

Browser benchmark page:

1. Build the package: `npm run build`
2. Serve the repository root with any static server
3. Open `benchmarks/browser/large-bench.html`
4. Select a large XML file and run the benchmark

Latest large-file run (this machine):

| Environment | Dataset | Parser settings | Elapsed | Throughput | Peak memory |
| --- | --- | --- | ---: | ---: | ---: |
| Node v24.7.0 (darwin arm64) | `10 x 250 MB` blobs (`2.44 GB` on disk) | `xmlns=false`, `coalesceText=false`, `trackPosition=false`, `1 MB` read chunks | `1.75 s` | `1,426.44 MB/s` | `217.8 MB RSS` |
| Browser (local run) | `10 x 250 MB` blobs (`2.44 GB` on disk) | `xmlns=false`, `coalesceText=false`, `trackPosition=false`, `1024 KB` chunk size | `1.97 s` | `1,272.2 MB/s` | `63.1 MB JS heap (end)` |

The benchmark now runs multiple rounds and reports median/mean/stddev for better comparability.

- `xml-sax-ts:sax` scenarios measure streaming event parsing
- `xml-sax-ts:sax` scenarios include explicit `xmlns=true/false` modes
- `xml-sax-ts:sax ... no-position` shows upper-bound throughput with `trackPosition: false`
- `comparable:*` scenarios run minimal equivalent feature sets for fair `xml-sax-ts` vs `saxes` comparison
- `xml-sax-ts:tree` scenario measures full tree parsing (`parseXmlString`)
- `sax` and `saxes` scenarios provide common SAX parser comparisons
- `fast-xml-parser` scenarios measure object parsing on the same input corpus

`fast-xml-parser`, `sax`, and `saxes` are included as dev dependencies so comparison is available out of the box.

Example output includes a direct ratio line:

`Comparable parse ratio (xml-sax-ts:sax vs fast-xml-parser:object): ...x`

Note: SAX event parsing and object materialization are not identical workloads. Use the tree scenario for a closer semantic comparison.

### Benchmark Methodology

- Benchmark command: `npm run bench`
- Runtime: Node `v24.7.0`
- Benchmark config defaults: `BENCH_ROUNDS=5`, `BENCH_MIN_MS=1200`, `BENCH_WARMUP=10`
- Corpus: repeated fixture corpus (`basic.xml`, `mixed.xml`, `namespaces.xml`) plus an entity-heavy synthetic case
- Output metric: median ops/s across rounds (with mean and stddev also shown)

### Benchmark Environment

- Published sample run device: MacBook Pro M4
- Memory: 48 GB RAM
- CPU: 14-core CPU
- GPU: 20-core GPU

GPU is not used by these Node.js parser benchmarks, but listed for full machine disclosure.

Latest sample (`npm run bench` defaults, Node `v24.7.0`):

| Scenario | Median ops/s |
| --- | ---: |
| `xml-sax-ts:sax single-feed xmlns=true` | 15,155.48 |
| `xml-sax-ts:sax single-feed xmlns=false` | 21,178.68 |
| `xml-sax-ts:sax single-feed xmlns=false no-position` | 22,230.83 |
| `sax:single-feed xmlns=false` | 8,357.12 |
| `saxes:single-feed xmlns=false` | 23,296.03 |
| `xml-sax-ts:tree parseXmlString` | 8,833.38 |
| `fast-xml-parser:object parse` | 6,128.40 |

Comparable minimal feature scenarios (fair `saxes` parity check):

| Scenario | Median ops/s |
| --- | ---: |
| `comparable:xml-sax-ts single-feed xmlns=false position=false` | 22,637.22 |
| `comparable:saxes single-feed xmlns=false position=false` | 23,305.98 |
| `comparable:xml-sax-ts single-feed xmlns=true position=false` | 16,468.14 |
| `comparable:saxes single-feed xmlns=true position=false` | 11,868.48 |

- `xml-sax-ts:sax (xmlns=false)` vs `sax (xmlns=false)`: `2.534x`
- `xml-sax-ts:sax (xmlns=true)` vs `sax (xmlns=true)`: `2.989x`
- `xml-sax-ts:sax (xmlns=false)` vs `saxes (xmlns=false)`: `0.909x`
- `comparable minimal (xmlns=false, xml-sax-ts vs saxes)`: `0.971x`
- `comparable minimal (xmlns=true, xml-sax-ts vs saxes)`: `1.388x`
- `xml-sax-ts:tree` vs `fast-xml-parser:object`: `1.441x`

Benchmark visualization (same sample run):

```mermaid
xychart-beta
  title "SAX Throughput (xmlns=false)"
  x-axis ["xml-sax-ts", "xml-sax-ts no-position", "sax", "saxes"]
  y-axis "ops/s" 0 --> 24000
  bar [21178.68, 22230.83, 8357.12, 23296.03]
```

```mermaid
xychart-beta
  title "Object/Tree Throughput"
  x-axis ["xml-sax-ts tree", "fast-xml-parser object"]
  y-axis "ops/s" 0 --> 9000
  bar [8833.38, 6128.40]
```

```mermaid
xychart-beta
  title "Comparable Minimal (position=false)"
  x-axis ["xml-sax-ts xmlns=false", "saxes xmlns=false", "xml-sax-ts xmlns=true", "saxes xmlns=true"]
  y-axis "ops/s" 0 --> 24000
  bar [22637.22, 23305.98, 16468.14, 11868.48]
```

Legend: `xml-sax-ts` bars are the first bars in each chart.

Best fair-comparison read:

- Use `comparable:*` scenarios for `xml-sax-ts` vs `saxes` parity checks.
- `xml-sax-ts ... no-position` is useful for peak throughput, but not a default-to-default comparison.

These values are machine-dependent; rerun on your hardware for release-quality numbers.

Current status for this environment: comparable runs show `xml-sax-ts` at `0.971x` of `saxes` on `xmlns=false` and `1.388x` on `xmlns=true`.

## API

### `XmlSaxParser`

```ts
new XmlSaxParser(options?: ParserOptions)
```

| Method.               | Description                                                                         |
| --------------------- | ----------------------------------------------------------------------------------- |
| `feed(chunk)`         | Feed one XML chunk and return parsed tokens for that chunk                          |
| `close()`             | Finalize parsing, validate state, and return remaining tokens plus `EndToken`       |
| `drainTokens()`       | Return and clear buffered tokens (usually empty if you consume `feed`/`close` return values) |
| `[Symbol.iterator]()` | Iterate currently buffered tokens                                                    |
| `iterateChunks(src)`  | Async iterator over an `Iterable<string>` or `AsyncIterable<string>` chunk source   |

#### `ParserOptions`

| Option                       | Type      | Default | Description                                    |
| ---------------------------- | --------- | ------- | ---------------------------------------------- |
| `xmlns`                      | `boolean` | `true`  | Enable namespace resolution                    |
| `includeNamespaceAttributes` | `boolean` | `false` | Include `xmlns:*` attributes in tag output     |
| `allowDoctype`               | `boolean` | `true`  | Allow `<!DOCTYPE …>` declarations              |
| `coalesceText`               | `boolean` | `true`  | Merge adjacent text tokens into a single token |
| `trackPosition`              | `boolean` | `true`  | Track line/column; disable for faster parsing  |

By default (`coalesceText: true`), adjacent text chunks are merged and emitted as one `TextToken` per structural boundary. Set `coalesceText: false` to keep chunk-level text tokenization.

`trackPosition` controls line/column tracking for parser errors. When set to `false`, parsing is faster and `XmlSaxError` still reports `offset`, while `line` and `column` are set to `0`.

Token payload note: with `xmlns: false`, `OpenTagToken` and `CloseTagToken` use plain-mode tag shapes aligned with `saxes` performance semantics.

- `OpenTagToken.tag.attributes` values are strings (not `XmlAttribute` objects)
- `OpenTagToken.tag` and `CloseTagToken.tag` omit `prefix`, `local`, and `uri`
- With `xmlns: true`, full namespace metadata remains present

### Tokens

Token classes:

- `OpenTagToken`
- `CloseTagToken`
- `TextToken`
- `CdataToken`
- `CommentToken`
- `ProcessingInstructionToken`
- `DoctypeToken`
- `EndToken`

All token classes derive from `XmlToken` and include:

- `kind`
- `position` (`{ offset, line, column }` when `trackPosition` is enabled)

`OpenTagToken` and `CloseTagToken` also include:

- `depth`
- `path`

### `tokenizeXml(xml, options?)`

Convenience helper for one-shot tokenization of a complete XML string.

### `tokenizeXmlAsync(chunks, options?)`

Convenience async generator for iterating tokens from an `Iterable<string>` or `AsyncIterable<string>` source.

### `parseXmlString(xml, options?)`

Convenience function that parses a complete XML string into an `XmlNode` tree using `XmlSaxParser` + `TreeBuilder` internally.

### `TreeBuilder`

Low-level tree builder. Consume parser tokens via `consume(token)` and call `getRoot()` to retrieve the resulting `XmlNode`.

### `buildObject(root, options?)`

Projects an `XmlNode` tree into a plain object. Attributes are prefixed (default `@_`), text is stored under `#text`, repeated elements are arrays, and elements with only text return the text directly.

### `ObjectBuilder`

Streaming builder that produces the same object shape as `buildObject` without building a full `XmlNode` tree. Consume parser tokens via `consume(token)`.

#### `ObjectBuilderOptions`

| Option             | Type                                                         | Default   | Description                                    |
| ------------------ | ------------------------------------------------------------ | --------- | ---------------------------------------------- |
| `attributePrefix`  | `string`                                                     | `"@_"`    | Prefix for attribute keys                      |
| `textKey`          | `string`                                                     | `"#text"` | Key used for text nodes                        |
| `stripNamespaces`  | `boolean`                                                    | `false`   | Strip namespace prefixes from names            |
| `arrayElements`    | `Set\<string\> \| (name: string, path: string[]) => boolean` | —         | Force specific elements to always be arrays    |
| `coalesceText`     | `boolean`                                                    | `true`    | Merge adjacent text nodes into a single string |

### `buildXmlNode(obj, options?)`

Converts a plain object into an `XmlNode` tree using the same attribute/text conventions as `buildObject`.

### `objectToXml(obj, options?)`

Builds an `XmlNode` with `buildXmlNode` and serializes it with `serializeXml`.

#### `XmlBuilderOptions`

| Option             | Type                                                         | Default   | Description                                    |
| ------------------ | ------------------------------------------------------------ | --------- | ---------------------------------------------- |
| `attributePrefix`  | `string`                                                     | `"@_"`    | Prefix for attribute keys                      |
| `textKey`          | `string`                                                     | `"#text"` | Key used for text nodes                        |
| `stripNamespaces`  | `boolean`                                                    | `false`   | Strip namespace prefixes from names            |
| `arrayElements`    | `Set\<string\> \| (name: string, path: string[]) => boolean` | —         | Force specific elements to always be arrays    |
| `rootName`         | `string`                                                     | —         | Root element name when object has multiple keys|

### `serializeXml(node, options?)`

Serializes an `XmlNode` back to an XML string.

#### `SerializeOptions`

| Option            | Type      | Default  | Description                              |
| ----------------- | --------- | -------- | ---------------------------------------- |
| `xmlDeclaration`  | `boolean` | `false`  | Prepend `<?xml …?>` declaration          |
| `pretty`          | `boolean` | `false`  | Enable indented output                   |
| `indent`          | `string`  | `"  "`   | Indentation string (when `pretty`)       |
| `newline`         | `string`  | `"\n"`   | Newline string (when `pretty`)           |

### `XmlSaxError`

Custom error class thrown on parse errors. Includes `offset`, `line`, and `column` properties for precise error location.

### Exported types

`XmlTokenKind` · `XmlAnyToken` · `OpenTag` · `CloseTag` · `XmlAttribute` · `ProcessingInstruction` · `Doctype` · `XmlNode` · `XmlChild` · `XmlPosition` · `XmlChunkIterable` · `ParserOptions` · `SerializeOptions` · `ObjectBuilderOptions` · `ArrayElementSelector` · `XmlObjectMap` · `XmlObjectValue` · `XmlBuilderOptions` · `XmlInputObject` · `XmlInputValue` · `ObjectToXmlOptions`

## Features

- Namespace resolution (`xmlns`)
- CDATA sections
- Entity decoding (named + numeric)
- Processing instructions
- DOCTYPE handling (parse + emit)
- Comments
- Precise error positions (line, column, offset)
- Pretty-print serialization with XML declaration

## Design-by-contract

Internal invariants are checked during development. Set `NODE_ENV=production` to strip them from production bundles — no runtime overhead.

## Development

```bash
npm install          # install dependencies
npm run build        # build ESM + CJS with tsup
npm test             # run tests with vitest
npm run test:watch   # run tests in watch mode
npm run lint         # eslint + tsc type check
npm run lint:fix     # auto-fix lint issues
```

## License

[MIT](./LICENSE) © Aaron Zielstorff

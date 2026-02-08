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

### SAX streaming

```ts
import { XmlSaxParser } from "xml-sax-ts";

const parser = new XmlSaxParser({
  onOpenTag: (tag) => console.log("open", tag.name, tag.attributes),
  onText: (text) => console.log("text", text),
  onCloseTag: (tag) => console.log("close", tag.name),
});

parser.feed("<root>");
parser.feed("Hello</root>");
parser.close();
```

### Parse to tree

```ts
import { parseXmlString } from "xml-sax-ts";

const root = parseXmlString("<root><a>1</a><b/></root>");
console.log(root.name); // "root"
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
//   <child>
//     World
//   </child>
// </root>
```

## API

### `XmlSaxParser`

```ts
new XmlSaxParser(options?: ParserOptions)
```

| Method    | Description                                       |
| --------- | ------------------------------------------------- |
| `feed(chunk)` | Feed a string chunk to the parser            |
| `close()`     | Signal end-of-input and validate open tags   |

#### `ParserOptions`

| Option                        | Type       | Default | Description                                    |
| ----------------------------- | ---------- | ------- | ---------------------------------------------- |
| `xmlns`                       | `boolean`  | `true`  | Enable namespace resolution                    |
| `includeNamespaceAttributes`  | `boolean`  | `false` | Include `xmlns:*` attributes in tag output     |
| `allowDoctype`                | `boolean`  | `true`  | Allow `<!DOCTYPE …>` declarations              |
| `onOpenTag`                   | `function` | —       | Called for each opening / self-closing tag      |
| `onCloseTag`                  | `function` | —       | Called for each closing tag                     |
| `onText`                      | `function` | —       | Called for text nodes                           |
| `onCdata`                     | `function` | —       | Called for CDATA sections                       |
| `onComment`                   | `function` | —       | Called for comments                             |
| `onProcessingInstruction`     | `function` | —       | Called for processing instructions (`<?…?>`)    |
| `onDoctype`                   | `function` | —       | Called for DOCTYPE declarations                 |
| `onError`                     | `function` | —       | Called on parse errors                          |

### `parseXmlString(xml, options?)`

Convenience function that parses a complete XML string into an `XmlNode` tree using `XmlSaxParser` + `TreeBuilder` internally.

### `TreeBuilder`

Low-level tree builder. Attach its `onOpenTag`, `onText`, `onCdata`, and `onCloseTag` methods to a parser, then call `getRoot()` to retrieve the resulting `XmlNode`.

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

`OpenTag` · `CloseTag` · `XmlAttribute` · `ProcessingInstruction` · `Doctype` · `XmlNode` · `XmlChild` · `XmlPosition` · `ParserOptions` · `SerializeOptions`

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

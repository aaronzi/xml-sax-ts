# xml-sax-ts

One-pass, streaming (SAX-style) XML parser for TypeScript (Node.js & browsers)

## Goals

- Streaming, one-pass parsing for large XML inputs
- Works in Node.js and modern browsers
- Minimal XML features (not a validation tool)
- Fast and predictable, with design-by-contract checks in debug builds

## Install (later)

```bash
npm install xml-sax-ts
```

## Usage

### Streaming parse

```ts
import { XmlSaxParser } from "xml-sax-ts";

const parser = new XmlSaxParser({
    onOpenTag: (tag) => console.log("open", tag.name, tag.attributes),
    onText: (text) => console.log("text", text),
    onCloseTag: (tag) => console.log("close", tag.name)
});

parser.feed("<root>");
parser.feed("Hello</root>");
parser.close();
```

### Deserialize to a tree

```ts
import { parseXmlString } from "xml-sax-ts";

const root = parseXmlString("<root><a>1</a><b/></root>");
console.log(root.name);
```

### Serialize a tree

```ts
import { serializeXml } from "xml-sax-ts";

const xml = serializeXml({
    name: "root",
    attributes: { id: "1" },
    children: ["Hello", { name: "child", children: ["World"] }]
});
```

## Features

- Namespaces (xmlns)
- CDATA sections
- Entity decoding (named + numeric)
- Processing instructions
- Doctype handling (parse + emit)

## Design-by-contract

Internal invariants and defensive checks are enabled in debug builds only.
Set `NODE_ENV=production` to disable them in production bundles.

## Testing

```bash
npm test
```

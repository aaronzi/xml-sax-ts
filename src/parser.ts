import { assert } from "./assert";
import { decodeEntities, splitTextForEntities } from "./entities";
import { XmlSaxError } from "./errors";
import type {
  CloseTag,
  Doctype,
  OpenTag,
  ParserOptions,
  ProcessingInstruction,
  XmlAttribute
} from "./types";

type NamespaceMap = Record<string, string>;

interface StackEntry {
  rawName: string;
  resolved: ResolvedName;
  ns: NamespaceMap;
}

interface RawAttribute {
  name: string;
  value: string;
}

interface ResolvedName {
  name: string;
  prefix: string;
  local: string;
  uri: string;
}

const DEFAULT_OPTIONS: Required<Pick<ParserOptions, "xmlns" | "includeNamespaceAttributes" | "allowDoctype">> = {
  xmlns: true,
  includeNamespaceAttributes: false,
  allowDoctype: true
};

const XML_NAMESPACE_URI = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE_URI = "http://www.w3.org/2000/xmlns/";

export class XmlSaxParser {
  private options: ParserOptions;
  private buffer = "";
  private offset = 0;
  private line = 1;
  private column = 1;
  private elementStack: StackEntry[] = [];
  private nsStack: NamespaceMap[] = [
    Object.assign(Object.create(null) as NamespaceMap, {
      xml: XML_NAMESPACE_URI,
      xmlns: XMLNS_NAMESPACE_URI
    })
  ];
  private closed = false;
  private pendingCR = false;

  constructor(options: ParserOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  feed(chunk: string): void {
    if (this.closed) {
      this._error("Parser is closed");
    }
    if (!chunk) {
      return;
    }
    this.buffer += chunk;
    this._parseBuffer(false);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this._parseBuffer(true);
    this._flushPendingCR();
    if (this.buffer.length > 0) {
      this._error("Unexpected end of input");
    }
    if (this.elementStack.length > 0) {
      this._error("Unclosed tag(s) remaining");
    }
    this.closed = true;
  }

  private _parseBuffer(final: boolean): void {
    let i = 0;

    while (i < this.buffer.length) {
      const lt = this.buffer.indexOf("<", i);
      if (lt === -1) {
        const tail = this.buffer.slice(i);
        const split = splitTextForEntities(tail);
        if (split.emit.length > 0) {
          this._emitText(split.emit, true);
          this._advance(split.emit);
        }
        this.buffer = split.carry;
        return;
      }

      if (lt > i) {
        const text = this.buffer.slice(i, lt);
        if (text.length > 0) {
          this._emitText(text, false);
          this._advance(text);
        }
        i = lt;
      }

      const consumed = this._parseMarkupFrom(lt, final);
      if (consumed === null) {
        break;
      }

      const markup = this.buffer.slice(lt, lt + consumed);
      this._advance(markup);
      i = lt + consumed;
    }

    this.buffer = this.buffer.slice(i);

    if (final && this.buffer.length > 0) {
      this._error("Unexpected end of input");
    }
  }

  private _parseMarkupFrom(start: number, final: boolean): number | null {
    assert(this.buffer[start] === "<", "Markup must start with '<'");

    this._flushPendingCR();

    if (this.buffer.startsWith("<!--", start)) {
      const end = this.buffer.indexOf("-->", start + 4);
      if (end === -1) {
        if (final) {
          this._error("Unterminated comment");
        }
        return null;
      }
      const comment = this.buffer.slice(start + 4, end);
      this.options.onComment?.(comment);
      return end + 3 - start;
    }

    if (this.buffer.startsWith("<![CDATA[", start)) {
      const end = this.buffer.indexOf("]]>", start + 9);
      if (end === -1) {
        if (final) {
          this._error("Unterminated CDATA section");
        }
        return null;
      }
      const cdata = this.buffer.slice(start + 9, end);
      const normalized = this._normalizeText(cdata, false);
      if (normalized.length > 0) {
        this.options.onCdata?.(normalized);
      }
      return end + 3 - start;
    }

    if (this.buffer.startsWith("<?", start)) {
      const end = this.buffer.indexOf("?>", start + 2);
      if (end === -1) {
        if (final) {
          this._error("Unterminated processing instruction");
        }
        return null;
      }
      const body = this.buffer.slice(start + 2, end).trim();
      const split = body.search(/\s/);
      const target = split === -1 ? body : body.slice(0, split);
      const data = split === -1 ? "" : body.slice(split).trim();
      const pi: ProcessingInstruction = { target, body: data };
      this.options.onProcessingInstruction?.(pi);
      return end + 2 - start;
    }

    if (this.buffer.startsWith("<!DOCTYPE", start)) {
      const end = this._findDoctypeEnd(start + 9);
      if (end === -1) {
        if (final) {
          this._error("Unterminated doctype declaration");
        }
        return null;
      }
      if (!this.options.allowDoctype) {
        this._error("Doctype is not allowed");
      }
      const raw = this.buffer.slice(start + 9, end).trim();
      const doctype: Doctype = { raw };
      this.options.onDoctype?.(doctype);
      return end + 1 - start;
    }

    if (this.buffer.startsWith("</", start)) {
      const end = this.buffer.indexOf(">", start + 2);
      if (end === -1) {
        if (final) {
          this._error("Unterminated closing tag");
        }
        return null;
      }
      const raw = this.buffer.slice(start + 2, end).trim();
      const parsed = this._parseName(raw, 0, raw.length);
      if (raw.slice(parsed.end).trim().length > 0) {
        this._error("Invalid closing tag");
      }
      this._handleCloseTag(parsed.name);
      return end + 1 - start;
    }

    const tagEnd = this._findTagEnd(start + 1);
    if (tagEnd === -1) {
      if (final) {
        this._error("Unterminated start tag");
      }
      return null;
    }

    const content = this.buffer.slice(start + 1, tagEnd);
    this._handleStartTag(content);
    return tagEnd + 1 - start;
  }

  private _handleStartTag(content: string): void {
    const trimmed = content.trim();
    const selfClosing = trimmed.endsWith("/");
    const body = selfClosing ? trimmed.slice(0, -1).trim() : trimmed;
    const parsed = this._parseTagBody(body);

    let ns = this._currentNs();
    if (this.options.xmlns) {
      ns = Object.create(ns) as NamespaceMap;
      for (const attr of parsed.attributes) {
        if (attr.name === "xmlns") {
          ns[""] = attr.value;
        } else if (attr.name.startsWith("xmlns:")) {
          ns[attr.name.slice(6)] = attr.value;
        }
      }
    }

    const resolvedName = this._resolveName(parsed.name, ns);
    const attributes: Record<string, XmlAttribute> = {};

    for (const attr of parsed.attributes) {
      if (this.options.xmlns && !this.options.includeNamespaceAttributes) {
        if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) {
          continue;
        }
      }
      const resolvedAttr = this._resolveAttributeName(attr.name, ns);
      attributes[resolvedAttr.name] = {
        name: resolvedAttr.name,
        value: attr.value,
        prefix: resolvedAttr.prefix,
        local: resolvedAttr.local,
        uri: resolvedAttr.uri
      };
    }

    const tag: OpenTag = {
      name: resolvedName.name,
      prefix: resolvedName.prefix,
      local: resolvedName.local,
      uri: resolvedName.uri,
      attributes,
      isSelfClosing: selfClosing
    };

    this.options.onOpenTag?.(tag);

    if (selfClosing) {
      const closeTag: CloseTag = {
        name: resolvedName.name,
        prefix: resolvedName.prefix,
        local: resolvedName.local,
        uri: resolvedName.uri
      };
      this.options.onCloseTag?.(closeTag);
      return;
    }

    this.elementStack.push({ rawName: parsed.name, resolved: resolvedName, ns });
    this.nsStack.push(ns);
  }

  private _handleCloseTag(rawName: string): void {
    const entry = this.elementStack.pop();
    const ns = this.nsStack.pop();

    if (!entry || !ns) {
      this._error("Closing tag without matching start tag");
    }

    if (entry.rawName !== rawName) {
      this._error(`Mismatched closing tag: expected </${entry.rawName}>`);
    }

    const closeTag: CloseTag = {
      name: entry.resolved.name,
      prefix: entry.resolved.prefix,
      local: entry.resolved.local,
      uri: entry.resolved.uri
    };

    this.options.onCloseTag?.(closeTag);
  }

  private _parseTagBody(body: string): { name: string; attributes: RawAttribute[] } {
    let i = 0;
    const length = body.length;

    i = this._skipWhitespace(body, i, length);
    const parsedName = this._parseName(body, i, length);
    i = parsedName.end;

    const attributes: RawAttribute[] = [];

    while (i < length) {
      i = this._skipWhitespace(body, i, length);
      if (i >= length) {
        break;
      }

      const attrName = this._parseName(body, i, length);
      i = attrName.end;
      i = this._skipWhitespace(body, i, length);

      if (body[i] !== "=") {
        this._error("Attribute without '='");
      }
      i += 1;
      i = this._skipWhitespace(body, i, length);

      const quote = body[i];
      if (quote !== "\"" && quote !== "'") {
        this._error("Attribute value must be quoted");
      }
      i += 1;

      const valueEnd = body.indexOf(quote, i);
      if (valueEnd === -1) {
        this._error("Unterminated attribute value");
      }
      const rawValue = body.slice(i, valueEnd);
      const normalized = rawValue.replace(/\r\n?/g, "\n");
      const value = decodeEntities(normalized, this.options.onError);
      attributes.push({ name: attrName.name, value });
      i = valueEnd + 1;
    }

    return { name: parsedName.name, attributes };
  }

  private _emitText(text: string, allowPendingCR: boolean): void {
    const normalized = this._normalizeText(text, allowPendingCR);
    if (normalized.length === 0) {
      return;
    }
    const decoded = decodeEntities(normalized, this.options.onError);
    if (decoded.length > 0) {
      this.options.onText?.(decoded);
    }
  }

  private _resolveName(rawName: string, ns: NamespaceMap): ResolvedName {
    if (!this.options.xmlns) {
      const split = rawName.indexOf(":");
      if (split === -1) {
        return { name: rawName, prefix: "", local: rawName, uri: "" };
      }
      return {
        name: rawName,
        prefix: rawName.slice(0, split),
        local: rawName.slice(split + 1),
        uri: ""
      };
    }

    const split = rawName.indexOf(":");
    if (split === -1) {
      return {
        name: rawName,
        prefix: "",
        local: rawName,
        uri: ns[""] ?? ""
      };
    }

    const prefix = rawName.slice(0, split);
    const local = rawName.slice(split + 1);
    const uri = ns[prefix];
    if (uri === undefined) {
      this._error(`Undeclared namespace prefix: ${prefix}`);
    }
    return {
      name: rawName,
      prefix,
      local,
      uri
    };
  }

  private _resolveAttributeName(rawName: string, ns: NamespaceMap): ResolvedName {
    if (!this.options.xmlns) {
      return this._resolveName(rawName, ns);
    }

    if (rawName === "xmlns") {
      return {
        name: rawName,
        prefix: "",
        local: rawName,
        uri: ns.xmlns ?? XMLNS_NAMESPACE_URI
      };
    }

    const split = rawName.indexOf(":");
    if (split === -1) {
      return {
        name: rawName,
        prefix: "",
        local: rawName,
        uri: ""
      };
    }

    const prefix = rawName.slice(0, split);
    const local = rawName.slice(split + 1);
    const uri = ns[prefix];
    if (uri === undefined) {
      this._error(`Undeclared namespace prefix: ${prefix}`);
    }

    return {
      name: rawName,
      prefix,
      local,
      uri
    };
  }

  private _findTagEnd(start: number): number {
    let quote: string | null = null;
    for (let i = start; i < this.buffer.length; i += 1) {
      const ch = this.buffer[i];
      if (quote) {
        if (ch === quote) {
          quote = null;
        }
        continue;
      }
      if (ch === "\"" || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === ">") {
        return i;
      }
    }
    return -1;
  }

  private _findDoctypeEnd(start: number): number {
    let quote: string | null = null;
    let bracketDepth = 0;

    for (let i = start; i < this.buffer.length; i += 1) {
      const ch = this.buffer[i];
      if (quote) {
        if (ch === quote) {
          quote = null;
        }
        continue;
      }
      if (ch === "\"" || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "[") {
        bracketDepth += 1;
        continue;
      }
      if (ch === "]") {
        bracketDepth = Math.max(0, bracketDepth - 1);
        continue;
      }
      if (ch === ">" && bracketDepth === 0) {
        return i;
      }
    }

    return -1;
  }

  private _parseName(input: string, start: number, end: number): { name: string; end: number } {
    if (start >= end) {
      this._error("Expected name");
    }

    const first = input[start];
    if (first === undefined) {
      this._error("Expected name");
    }
    if (!this._isNameStart(first)) {
      this._error(`Invalid name start: '${first}'`);
    }

    let i = start + 1;
    while (i < end) {
      const ch = input[i];
      if (ch === undefined || !this._isNameChar(ch)) {
        break;
      }
      i += 1;
    }

    return { name: input.slice(start, i), end: i };
  }

  private _isNameStart(ch: string): boolean {
    return /[A-Za-z_]/.test(ch);
  }

  private _isNameChar(ch: string): boolean {
    return /[A-Za-z0-9_:\-.]/.test(ch);
  }

  private _skipWhitespace(input: string, start: number, end: number): number {
    let i = start;
    while (i < end) {
      const ch = input[i];
      if (ch === undefined || !/\s/.test(ch)) {
        break;
      }
      i += 1;
    }
    return i;
  }

  private _currentNs(): NamespaceMap {
    return this.nsStack[this.nsStack.length - 1] ?? (Object.create(null) as NamespaceMap);
  }

  private _advance(text: string): void {
    this.offset += text.length;
    const lastNewline = text.lastIndexOf("\n");
    if (lastNewline === -1) {
      this.column += text.length;
      return;
    }

    const newlineCount = text.split("\n").length - 1;
    this.line += newlineCount;
    this.column = text.length - lastNewline;
  }

  private _normalizeText(text: string, allowPendingCR: boolean): string {
    if (!text) {
      return "";
    }

    let value = text;
    let prefix = "";

    if (this.pendingCR) {
      prefix = "\n";
      if (value.startsWith("\n")) {
        value = value.slice(1);
      }
      this.pendingCR = false;
    }

    if (allowPendingCR && value.endsWith("\r")) {
      this.pendingCR = true;
      value = value.slice(0, -1);
    }

    const normalized = value.replace(/\r\n?/g, "\n");
    return `${prefix}${normalized}`;
  }

  private _flushPendingCR(): void {
    if (!this.pendingCR) {
      return;
    }
    this.pendingCR = false;
    this.options.onText?.("\n");
  }

  private _error(message: string): never {
    const error = new XmlSaxError(message, this.offset, this.line, this.column);
    this.options.onError?.(error);
    throw error;
  }
}

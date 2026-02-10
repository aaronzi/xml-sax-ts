import type {
  ObjectBuilderOptions,
  OpenTag,
  XmlAttribute,
  XmlNode,
  XmlObjectMap,
  XmlObjectValue
} from "./types";

interface ElementState {
  name: string;
  attributes: Record<string, string>;
  textParts: string[];
  children: Record<string, XmlObjectValue | XmlObjectValue[]>;
}

const DEFAULT_OBJECT_OPTIONS: Required<Omit<ObjectBuilderOptions, "arrayElements">> = {
  attributePrefix: "@_",
  textKey: "#text",
  stripNamespaces: false,
  coalesceText: true
};

type ObjectBuilderSettings = Required<Omit<ObjectBuilderOptions, "arrayElements">> &
  Pick<ObjectBuilderOptions, "arrayElements">;

export function stripNamespace(name: string): string {
  const index = name.indexOf(":");
  if (index === -1) {
    return name;
  }
  return name.slice(index + 1);
}

export function resolveName(
  value: string | Pick<OpenTag, "name" | "prefix" | "local" | "uri">
): { name: string; localName: string; prefix: string; uri: string } {
  if (typeof value !== "string") {
    return {
      name: value.name,
      localName: value.local,
      prefix: value.prefix,
      uri: value.uri
    };
  }

  const index = value.indexOf(":");
  if (index === -1) {
    return { name: value, localName: value, prefix: "", uri: "" };
  }

  return {
    name: value,
    localName: value.slice(index + 1),
    prefix: value.slice(0, index),
    uri: ""
  };
}

export function buildObject(root: XmlNode, options: ObjectBuilderOptions = {}): XmlObjectValue {
  const settings = buildSettings(options);
  return buildNode(root, settings, []);
}

export class ObjectBuilder {
  private options: ObjectBuilderSettings;
  private stack: ElementState[] = [];
  private root: XmlObjectValue | null = null;
  private rootName: string | null = null;

  constructor(options: ObjectBuilderOptions = {}) {
    this.options = buildSettings(options);
  }

  onOpenTag = (tag: OpenTag): void => {
    const name = normalizeName(tag.name, this.options);
    const attributes = normalizeAttributes(tag.attributes, this.options);
    const state: ElementState = {
      name,
      attributes,
      textParts: [],
      children: Object.create(null) as Record<string, XmlObjectValue | XmlObjectValue[]>
    };

    this.rootName ??= name;

    this.stack.push(state);
  };

  onText = (text: string): void => {
    if (!text) {
      return;
    }
    const current = this.stack[this.stack.length - 1];
    if (!current) {
      return;
    }
    current.textParts.push(text);
  };

  onCdata = (text: string): void => {
    this.onText(text);
  };

  onCloseTag = (): void => {
    const state = this.stack.pop();
    if (!state) {
      return;
    }

    const value = finalizeElement(state, this.options);
    const parent = this.stack[this.stack.length - 1];

    if (!parent) {
      this.root = value;
      return;
    }

    const path = this.stack.map((entry) => entry.name);
    addChild(parent.children, state.name, value, this.options, path);
  };

  getResult(): XmlObjectValue {
    if (this.root === null) {
      throw new Error("No root element found");
    }
    return this.root;
  }

  getRootName(): string {
    if (!this.rootName) {
      throw new Error("No root element found");
    }
    return this.rootName;
  }
}

function buildSettings(options: ObjectBuilderOptions): ObjectBuilderSettings {
  return { ...DEFAULT_OBJECT_OPTIONS, ...options };
}

function buildNode(node: XmlNode, options: ObjectBuilderSettings, path: string[]): XmlObjectValue {
  const name = normalizeName(node.name, options);
  const attributes = normalizeAttributeMap(node.attributes ?? {}, options);
  const state: ElementState = {
    name,
    attributes,
    textParts: [],
    children: Object.create(null) as Record<string, XmlObjectValue | XmlObjectValue[]>
  };

  const children = node.children ?? [];
  for (const child of children) {
    if (typeof child === "string") {
      if (child) {
        state.textParts.push(child);
      }
      continue;
    }

    const value = buildNode(child, options, [...path, name]);
    const childName = normalizeName(child.name, options);
    addChild(state.children, childName, value, options, [...path, name]);
  }

  return finalizeElement(state, options);
}

function normalizeName(name: string, options: ObjectBuilderSettings): string {
  if (options.stripNamespaces) {
    return stripNamespace(name);
  }
  return name;
}

function normalizeAttributes(
  attributes: Record<string, XmlAttribute>,
  options: ObjectBuilderSettings
): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, attr] of Object.entries(attributes)) {
    const name = normalizeName(key, options);
    result[name] = attr.value;
  }
  return result;
}

function normalizeAttributeMap(
  attributes: Record<string, string>,
  options: ObjectBuilderSettings
): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(attributes)) {
    const name = normalizeName(key, options);
    result[name] = value;
  }
  return result;
}

function addChild(
  target: Record<string, XmlObjectValue | XmlObjectValue[]>,
  name: string,
  value: XmlObjectValue,
  options: ObjectBuilderSettings,
  path: string[]
): void {
  const forcedArray = shouldForceArray(name, path, options);
  const existing = target[name];

  if (existing === undefined) {
    target[name] = forcedArray ? [value] : value;
    return;
  }

  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }

  target[name] = [existing, value];
}

function shouldForceArray(name: string, path: string[], options: ObjectBuilderSettings): boolean {
  const rule = options.arrayElements;
  if (!rule) {
    return false;
  }
  if (rule instanceof Set) {
    return rule.has(name);
  }
  return rule(name, path);
}

function finalizeElement(state: ElementState, options: ObjectBuilderSettings): XmlObjectValue {
  const hasAttributes = Object.keys(state.attributes).length > 0;
  const hasChildren = Object.keys(state.children).length > 0;
  const hasText = state.textParts.length > 0;

  const textValue = options.coalesceText
    ? state.textParts.join("")
    : state.textParts.length <= 1
      ? state.textParts[0] ?? ""
      : state.textParts.slice();

  if (!hasAttributes && !hasChildren) {
    if (!hasText) {
      return "";
    }
    return textValue as XmlObjectValue;
  }

  const result: XmlObjectMap = Object.create(null) as XmlObjectMap;

  for (const [key, value] of Object.entries(state.attributes)) {
    result[`${options.attributePrefix}${key}`] = value;
  }

  for (const [key, value] of Object.entries(state.children)) {
    result[key] = value;
  }

  if (hasText) {
    result[options.textKey] = textValue as XmlObjectValue;
  }

  return result;
}

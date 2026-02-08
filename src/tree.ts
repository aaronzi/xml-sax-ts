import { XmlSaxParser } from "./parser";
import type { ParserOptions, XmlNode } from "./types";

export class TreeBuilder {
  private stack: XmlNode[] = [];
  private root: XmlNode | null = null;

  onOpenTag = (tag: { name: string; attributes: Record<string, { value: string }> }): void => {
    const node: XmlNode = {
      name: tag.name,
      attributes: Object.fromEntries(
        Object.entries(tag.attributes).map(([key, attr]) => [key, attr.value])
      ),
      children: []
    };

    const parent = this.stack[this.stack.length - 1];
    if (parent) {
      parent.children?.push(node);
    } else {
      this.root = node;
    }

    this.stack.push(node);
  };

  onText = (text: string): void => {
    if (!this.stack.length) {
      return;
    }
    const node = this.stack[this.stack.length - 1];
    if (!node) {
      return;
    }
    const children = node.children ?? [];
    const last = children[children.length - 1];
    if (typeof last === "string") {
      children[children.length - 1] = last + text;
    } else {
      children.push(text);
    }
    node.children = children;
  };

  onCdata = (text: string): void => {
    this.onText(text);
  };

  onCloseTag = (): void => {
    this.stack.pop();
  };

  getRoot(): XmlNode {
    if (!this.root) {
      throw new Error("No root element found");
    }
    return this.root;
  }
}

export function parseXmlString(xml: string, options: ParserOptions = {}): XmlNode {
  const builder = new TreeBuilder();
  const parser = new XmlSaxParser({
    ...options,
    onOpenTag: builder.onOpenTag,
    onText: builder.onText,
    onCdata: builder.onCdata,
    onCloseTag: builder.onCloseTag
  });

  parser.feed(xml);
  parser.close();
  return builder.getRoot();
}

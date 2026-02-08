export interface XmlPosition {
  offset: number;
  line: number;
  column: number;
}

export interface XmlAttribute {
  name: string;
  value: string;
  prefix: string;
  local: string;
  uri: string;
}

export interface OpenTag {
  name: string;
  prefix: string;
  local: string;
  uri: string;
  attributes: Record<string, XmlAttribute>;
  isSelfClosing: boolean;
}

export interface CloseTag {
  name: string;
  prefix: string;
  local: string;
  uri: string;
}

export interface ProcessingInstruction {
  target: string;
  body: string;
}

export interface Doctype {
  raw: string;
}

export interface ParserOptions {
  xmlns?: boolean;
  includeNamespaceAttributes?: boolean;
  allowDoctype?: boolean;
  onOpenTag?: (tag: OpenTag) => void;
  onCloseTag?: (tag: CloseTag) => void;
  onText?: (text: string) => void;
  onCdata?: (text: string) => void;
  onComment?: (text: string) => void;
  onProcessingInstruction?: (pi: ProcessingInstruction) => void;
  onDoctype?: (doctype: Doctype) => void;
  onError?: (error: Error) => void;
}

export type XmlChild = XmlNode | string;

export interface XmlNode {
  name: string;
  attributes?: Record<string, string>;
  children?: XmlChild[];
}

export interface SerializeOptions {
  xmlDeclaration?: boolean;
  pretty?: boolean;
  indent?: string;
  newline?: string;
}

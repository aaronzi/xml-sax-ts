export { XmlSaxParser } from "./parser";
export { XmlSaxError } from "./errors";
export { parseXmlString, TreeBuilder } from "./tree";
export { serializeXml } from "./serializer";
export { buildObject, ObjectBuilder, resolveName, stripNamespace } from "./object";
export type {
  ArrayElementSelector,
  CloseTag,
  Doctype,
  ObjectBuilderOptions,
  OpenTag,
  ParserOptions,
  ProcessingInstruction,
  SerializeOptions,
  XmlObjectMap,
  XmlObjectValue,
  XmlAttribute,
  XmlChild,
  XmlNode,
  XmlPosition
} from "./types";

export { XmlSaxParser } from "./parser";
export { XmlSaxError } from "./errors";
export { parseXmlString, TreeBuilder } from "./tree";
export { serializeXml } from "./serializer";
export {
  buildObject,
  buildXmlNode,
  objectToXml,
  ObjectBuilder,
  resolveName,
  stripNamespace
} from "./object";
export type {
  ArrayElementSelector,
  CloseTag,
  Doctype,
  ObjectToXmlOptions,
  ObjectBuilderOptions,
  OpenTag,
  ParserOptions,
  ProcessingInstruction,
  SerializeOptions,
  XmlObjectMap,
  XmlObjectValue,
  XmlBuilderOptions,
  XmlInputObject,
  XmlInputValue,
  XmlAttribute,
  XmlChild,
  XmlNode,
  XmlPosition
} from "./types";

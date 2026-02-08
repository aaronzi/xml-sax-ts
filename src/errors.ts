export class XmlSaxError extends Error {
  readonly offset: number;
  readonly line: number;
  readonly column: number;

  constructor(message: string, offset: number, line: number, column: number) {
    super(`${message} at ${line}:${column}`);
    this.name = "XmlSaxError";
    this.offset = offset;
    this.line = line;
    this.column = column;
  }
}

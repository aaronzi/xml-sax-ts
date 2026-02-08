const DEV = typeof process !== "undefined" ? process.env.NODE_ENV !== "production" : true;

export function assert(condition: boolean, message: string): void {
  if (!DEV) {
    return;
  }
  if (!condition) {
    throw new Error(`Invariant failed: ${message}`);
  }
}

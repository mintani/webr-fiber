/** An object written as a literal or created by `Object.create(null)`, not an instance of a class. */
export type Plain = Record<string, unknown>;

export function isPlain(value: unknown): value is Plain {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

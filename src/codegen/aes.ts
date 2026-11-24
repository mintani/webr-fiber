import { expression, quoteName } from "./literal.js";
import type { RExpression } from "./literal.js";

/**
 * Writes a ggplot2 `aes()` call from an object.
 *
 * A string is a column name. Any other value is converted like a prop value, so an `r`
 * expression is inserted as written. Entries with an `undefined` value are left out.
 */
export function aes(mapping: Readonly<Record<string, unknown>>): RExpression {
  const args = Object.entries(mapping)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) =>
      typeof value === "string"
        ? expression([`${quoteName(name)} = ${quoteName(value)}`], [])
        : expression([`${quoteName(name)} = `, ""], [value]),
    );
  return expression(["aes(", ...args.slice(1).map(() => ", "), ")"], args);
}

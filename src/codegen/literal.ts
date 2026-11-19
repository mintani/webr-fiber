const EXPRESSION = Symbol.for("webr-fiber.expression");

/** An R expression written with the {@link r} tagged template. */
export interface RExpression {
  readonly [EXPRESSION]: true;
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
}

/**
 * Writes an R expression that is inserted into the generated code without quoting.
 *
 * The text is taken as written, so R escapes such as `"\\d"` need no extra backslash.
 * Interpolated values are converted by the same rules as prop values.
 */
export function r(
  strings: TemplateStringsArray,
  ...values: unknown[]
): RExpression {
  return {
    [EXPRESSION]: true,
    // A backtick and `${` can only be written escaped in a template, so the escape is dropped.
    strings: strings.raw.map((text) => text.replace(/\\(`|\$\{)/g, "$1")),
    values,
  };
}

function isExpression(value: unknown): value is RExpression {
  return typeof value === "object" && value !== null && EXPRESSION in value;
}

const UNPAIRED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function assertRepresentable(text: string): void {
  if (text.includes("\0") || UNPAIRED_SURROGATE.test(text)) {
    throw new TypeError(
      `R cannot hold a NUL character or an unpaired surrogate: ${JSON.stringify(text)}`,
    );
  }
}

const RESERVED = new Set([
  "if",
  "else",
  "repeat",
  "while",
  "function",
  "for",
  "in",
  "next",
  "break",
  "TRUE",
  "FALSE",
  "NULL",
  "Inf",
  "NaN",
  "NA",
  "NA_integer_",
  "NA_real_",
  "NA_complex_",
  "NA_character_",
]);

// A leading dot must not be followed by a digit (`.2x`) or another dot (`...`, `..1`).
const SYNTACTIC_NAME = /^(?:[A-Za-z]|\.(?![0-9.]))[A-Za-z0-9._]*$/;

/** Returns `name` as an R name, quoted with backticks if it is not a valid name on its own. */
export function quoteName(name: string): string {
  if (name === "") throw new TypeError("An R name cannot be empty");
  assertRepresentable(name);
  if (SYNTACTIC_NAME.test(name) && !RESERVED.has(name)) return name;
  return `\`${name.replace(/[\\`]/g, "\\$&")}\``;
}

/** Returns a function name, keeping the package in `pkg::fn` and `pkg:::fn`. */
export function quoteFunctionName(name: string): string {
  const match = /^(.+?)(:::?)(.+)$/.exec(name);
  if (!match) return quoteName(name);
  const [, pkg = "", operator = "", fn = ""] = match;
  return `${quoteName(pkg)}${operator}${quoteName(fn)}`;
}

function atom(value: unknown, missing: string): string | undefined {
  if (value === null) return missing;
  switch (typeof value) {
    case "number":
      return Number.isFinite(value) ? String(value) : "NA";
    case "boolean":
      return value ? "TRUE" : "FALSE";
    case "string":
      assertRepresentable(value);
      return JSON.stringify(value);
    default:
      return undefined;
  }
}

/**
 * Converts a JavaScript value to R code.
 *
 * Numbers, strings, booleans, `null` and arrays of these become literals. Any other object is
 * passed to `bind`, which returns the variable name that will hold it in R.
 */
export function toCode(
  value: unknown,
  bind: (value: object) => string,
): string {
  if (isExpression(value)) {
    return value.strings
      .map((text, index) =>
        index < value.values.length
          ? text + toCode(value.values[index], bind)
          : text,
      )
      .join("");
  }
  const scalar = atom(value, "NULL");
  if (scalar !== undefined) return scalar;
  if (Array.isArray(value)) {
    // `c()` drops NULL, so a missing element is NA to keep the length of the vector.
    const elements = Array.from(value, (element) =>
      isExpression(element)
        ? toCode(element, bind)
        : atom(element ?? null, "NA"),
    );
    if (elements.every((element) => element !== undefined))
      return `c(${elements.join(", ")})`;
  }
  if (typeof value === "object" && value !== null) return bind(value);
  throw new TypeError(`Cannot convert a value of type ${typeof value} to R`);
}

/**
 * How a function and its children are combined.
 *
 * - `plus`: joined with ` + `, as in ggplot2.
 * - `sequence`: the function, then each child as its own statement, as in base graphics.
 */
export type Composer = "plus" | "sequence";

// The functions of the graphics package that start a new plot. Children add to that plot.
const BASE_PLOTS = [
  "plot",
  "hist",
  "barplot",
  "boxplot",
  "pie",
  "curve",
  "pairs",
  "coplot",
  "matplot",
  "dotchart",
  "image",
  "contour",
  "persp",
  "qqnorm",
  "qqplot",
];

const catalogue = new Map<string, Composer>([
  ["ggplot", "plus"],
  ...BASE_PLOTS.map((name): [string, Composer] => [name, "sequence"]),
]);

/** Registers composers for more function names. A later call replaces an earlier entry. */
export function extend(entries: Readonly<Record<string, Composer>>): void {
  for (const [name, composer] of Object.entries(entries)) {
    if (name === "call")
      throw new TypeError('"call" is built in and cannot be registered');
    catalogue.set(name, composer);
  }
}

/**
 * Returns the composer registered for a node type, if any. `pkg::fn` falls back to the entry of
 * `fn`.
 */
export function composerOf(type: string): Composer | undefined {
  return catalogue.get(type) ?? catalogue.get(type.replace(/^.*?:::?/, ""));
}

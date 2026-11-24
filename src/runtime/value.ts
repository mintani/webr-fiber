import type { WebR } from "webr";
import type { Generated } from "../codegen/compose.js";
import { toEnv } from "./evaluate.js";

// The name under which the R code below hands over the columns of a data frame.
const ROWS = "webr-fiber:rows";

/**
 * R code that prepares the value `x` for `toJs()`, which keeps names but no other attribute.
 * Factors and dates become character vectors, a data frame becomes a tagged list of its
 * columns, a matrix becomes a list of its rows, and a value without a JavaScript form is an error.
 */
const TO_PLAIN = `(function(x) {
  # format() cuts fractions of a second instead of rounding them, so milliseconds are added here.
  iso <- function(x) {
    ms <- round(as.numeric(as.POSIXct(x)) * 1000)
    text <- format(.POSIXct(ms %/% 1000, tz = "UTC"), "%Y-%m-%dT%H:%M:%S")
    ifelse(is.na(ms), NA_character_, paste0(text, sprintf(".%03dZ", ms %% 1000)))
  }
  plain <- function(x) {
    if (is.null(x)) return(NULL)
    if (inherits(x, "POSIXt")) x <- structure(iso(x), names = names(x))
    else if (inherits(x, "Date")) x <- format(x, "%Y-%m-%d")
    else if (is.factor(x)) x <- structure(as.character(x), names = names(x))
    if (is.data.frame(x)) return(list(\`${ROWS}\` = lapply(unclass(x), plain)))
    # unclass() keeps a class from iterating in its own way, as numeric_version does.
    if (is.list(x)) return(lapply(unclass(x), plain))
    if (!is.atomic(x)) stop("webr-fiber cannot convert an R value of class ", class(x)[1])
    if (length(dim(x)) == 2) {
      # x[i, ] alone loses the name of a single column.
      return(lapply(seq_len(nrow(x)), function(i) structure(x[i, ], names = colnames(x))))
    }
    if (length(dim(x)) > 2) stop("webr-fiber cannot convert an array with more than two dimensions")
    x
  }
  plain(x)
})(x)`;

/** The tree that webR's `toJs()` returns, as far as plain values use it. */
export interface Tree {
  type: string;
  names?: readonly (string | null)[] | null;
  values?: readonly unknown[];
}

/** An object from name to value if every element has a unique name, otherwise the values. */
function named(names: Tree["names"], values: readonly unknown[]): unknown {
  const usable =
    names &&
    names.every((name) => name) &&
    new Set(names).size === names.length;
  if (!usable) return values;
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

const isRows = (tree: Tree): boolean =>
  tree.type === "list" && tree.names?.length === 1 && tree.names[0] === ROWS;

/** One value per row of a data frame column. */
function cells(column: Tree): readonly unknown[] {
  if (column.type !== "list") return column.values ?? [];
  // A list column holds one value per row, whatever its names are.
  const names = isRows(column) ? column.names : null;
  return fromR({ ...column, names }) as readonly unknown[];
}

function rows(columns: Tree): Record<string, unknown>[] {
  const names = columns.names ?? [];
  const values = (columns.values ?? []).map((column) => cells(column as Tree));
  return Array.from({ length: values[0]?.length ?? 0 }, (_, row) =>
    Object.fromEntries(
      names.map((name, index) => [name, values[index]?.[row]]),
    ),
  );
}

/** Turns the tree of a plain R value into a JavaScript value. */
export function fromR(tree: Tree): unknown {
  if (tree.type === "null") return null;
  const values = tree.values ?? [];
  if (tree.type !== "list") return named(tree.names, values);
  if (isRows(tree)) return rows(values[0] as Tree);
  return named(
    tree.names,
    values.map((value) => fromR(value as Tree)),
  );
}

/**
 * Runs generated code in webR and returns its value as a JavaScript value.
 * What the code prints or draws is dropped.
 */
export async function evaluateValue(
  webR: WebR,
  { code, env }: Generated,
): Promise<unknown> {
  const shelter = await new webR.Shelter();
  try {
    const { result } = await shelter.captureR(code, {
      env: await toEnv(shelter, env),
      captureGraphics: false,
    });
    // A second call keeps the conversion apart from the code of the caller.
    const plain = await shelter.evalR(TO_PLAIN, { env: { x: result } });
    return fromR((await plain.toJs()) as Tree);
  } finally {
    await shelter.purge();
  }
}

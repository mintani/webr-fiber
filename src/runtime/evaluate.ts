import type { EvalROptions, RObject, Shelter, WebR } from "webr";
import type { Generated } from "../codegen/compose.js";

type WebRData = NonNullable<EvalROptions["env"]>;

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mapEntries(
  record: Plain,
  each: (name: string, item: unknown) => unknown,
): Plain {
  return Object.fromEntries(
    Object.entries(record).map(([name, item]) => [name, each(name, item)]),
  );
}

/**
 * Copies an array of rows or a plain object with each cell replaced by what `visit` returns for
 * it. A cell is a value of a row, an item of a column, or a value of the object that is not an
 * array. Any other value is returned as it is.
 */
function mapCells(
  value: unknown,
  visit: (column: string, cell: unknown) => unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map((row: unknown) =>
      isPlain(row) ? mapEntries(row, visit) : row,
    );
  }
  if (!isPlain(value)) return value;
  return mapEntries(value, (name, column) =>
    Array.isArray(column)
      ? column.map((cell: unknown) => visit(name, cell))
      : visit(name, column),
  );
}

// Works on a data frame and on a named list. Names that `x` does not have are skipped.
const TO_DATE_TIMES = `columns <- intersect(columns, names(x))
x[columns] <- lapply(x[columns], as.POSIXct, tz = "UTC")
x`;

/**
 * Converts a bound object to R.
 *
 * webR builds a data frame from an array of rows or an object of columns, and throws for any
 * other object. Those become a named list. webR cannot take a `Date`, so dates travel as seconds
 * since 1970, and the columns or list items that held them become date-times in R.
 */
async function toR(shelter: Shelter, value: unknown): Promise<RObject> {
  const dateColumns = new Set<string>();
  const plain = mapCells(value, (column, cell) => {
    if (!(cell instanceof Date)) return cell;
    dateColumns.add(column);
    const time = cell.getTime();
    return Number.isNaN(time) ? null : time / 1000;
  }) as WebRData;
  let object: RObject;
  try {
    object = await new shelter.RObject(plain);
  } catch {
    object = await new shelter.RList(plain);
  }
  if (dateColumns.size === 0) return object;
  return shelter.evalR(TO_DATE_TIMES, {
    env: { x: object, columns: [...dateColumns] },
  });
}

/**
 * Runs generated code in webR and returns the last plot, or `null` if nothing was drawn.
 *
 * Visible values are printed as at the R console, so a ggplot object draws without `print()`.
 * The caller owns the returned image and has to close it.
 */
export async function evaluate(
  webR: WebR,
  { code, env }: Generated,
  width: number,
  height: number,
): Promise<ImageBitmap | null> {
  const shelter = await new webR.Shelter();
  try {
    const bound: Record<string, RObject> = {};
    for (const [name, value] of Object.entries(env)) {
      bound[name] = await toR(shelter, value);
    }
    const { images } = await shelter.captureR(code, {
      env: bound,
      captureGraphics: { width, height, bg: "white" },
      withAutoprint: true,
    });
    const last = images.pop() ?? null;
    for (const image of images) image.close();
    return last;
  } finally {
    await shelter.purge();
  }
}

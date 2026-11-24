import type { EvalROptions, RObject, Shelter, WebR } from "webr";
import type { Generated } from "../codegen/compose.js";

type WebRData = NonNullable<EvalROptions["env"]>;

/**
 * webR builds a data frame from an array of rows or an object of columns, and throws for any
 * other object. Those become a named list.
 */
async function toR(shelter: Shelter, value: WebRData): Promise<RObject> {
  try {
    return await new shelter.RObject(value);
  } catch {
    return await new shelter.RList(value);
  }
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
      bound[name] = await toR(shelter, value as WebRData);
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

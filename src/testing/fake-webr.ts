import { vi } from "vitest";
import type { WebR } from "webr";

type Capture = { images: ImageBitmap[]; output: never[]; result: object };

/** A stand-in for an `ImageBitmap` that records whether it was closed. */
export function fakeImage(): ImageBitmap {
  return { width: 1200, height: 800, close: vi.fn<() => void>() };
}

// webR classes are created with `await new Class(value)`.
const asyncClass = <T>(make: (value: unknown) => T) =>
  function construct(value: unknown) {
    return Promise.resolve().then(() => make(value));
  } as unknown as new (value: unknown) => Promise<T>;

/**
 * A webR that records calls instead of running R.
 *
 * `captureR` resolves with one image by default. Like webR, `RObject` only accepts arrays and
 * objects of arrays, so that other objects have to become an `RList`.
 */
export function fakeWebR() {
  const captureR = vi.fn<(code: string, options: object) => Promise<Capture>>(
    () => Promise.resolve({ images: [fakeImage()], output: [], result: {} }),
  );
  const purge = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const shelter = {
    RObject: asyncClass((value) => {
      const eligible =
        Array.isArray(value) ||
        (typeof value === "object" &&
          value !== null &&
          Object.values(value).every(Array.isArray));
      if (!eligible) throw new Error("Can't construct `data.frame`.");
      return { r: "data.frame", value };
    }),
    RList: asyncClass((value) => ({ r: "list", value })),
    captureR,
    purge,
  };
  const fake = {
    init: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    installPackages: vi.fn<(packages: string[]) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    evalRVoid: vi.fn<(code: string) => Promise<void>>(() => Promise.resolve()),
    Shelter: asyncClass(() => shelter),
  };
  return { webR: fake as unknown as WebR, ...fake, captureR, purge };
}

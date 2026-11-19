import type { ReactNode } from "react";

type RProps = { children?: ReactNode } & Record<string, unknown>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      /** Calls the function named by `fn` with `args` as positional arguments. */
      call: RProps & { fn: string; args?: readonly unknown[] };
      /** Any other lowercase tag is the R function of that name. */
      [fn: string]: RProps;
    }
  }
}

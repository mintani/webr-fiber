import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { WebR } from "webr";
import { quoteName } from "../codegen/literal.js";

/** The webR instance of the app and whether it can run code yet. */
export interface WebRState {
  webR: WebR;
  status: "loading" | "ready" | "error";
  /** The reason for the status `error`. */
  error?: unknown;
}

interface WebRProviderProps {
  /** An instance created by the app. The provider initialises it but never closes it. */
  webR: WebR;
  /** R packages to install and attach before the status becomes `ready`. */
  packages?: readonly string[];
  children?: ReactNode;
}

const WebRContext = createContext<WebRState | null>(null);

const prepared = new WeakMap<WebR, Map<string, Promise<void>>>();

/**
 * Initialises the instance and installs and attaches the packages, once per instance and list.
 * `key` is the list of package names joined with line breaks.
 */
function prepare(webR: WebR, key: string): Promise<void> {
  let byKey = prepared.get(webR);
  if (!byKey) prepared.set(webR, (byKey = new Map()));
  let ready = byKey.get(key);
  if (!ready) {
    ready = (async () => {
      await webR.init();
      // webR 0.6.1 never settles `installPackages` for an empty list.
      if (key === "") return;
      const packages = key.split("\n");
      await webR.installPackages(packages);
      await webR.evalRVoid(
        packages.map((name) => `library(${quoteName(name)})`).join("\n"),
      );
    })();
    byKey.set(key, ready);
  }
  return ready;
}

/** Shares one webR instance with every component below it and prepares it for use. */
export function WebRProvider({
  webR,
  packages = [],
  children,
}: WebRProviderProps): ReactNode {
  const key = packages.join("\n");
  const loading = useMemo<WebRState>(
    () => ({ webR, status: "loading" }),
    [webR],
  );
  const [settled, setSettled] = useState<{
    key: string;
    state: WebRState;
  } | null>(null);

  useEffect(() => {
    let current = true;
    const settle = (result: Pick<WebRState, "status" | "error">): void => {
      if (current) setSettled({ key, state: { webR, ...result } });
    };
    prepare(webR, key).then(
      () => settle({ status: "ready" }),
      (error: unknown) => settle({ status: "error", error }),
    );
    return () => {
      current = false;
    };
  }, [webR, key]);

  const state =
    settled?.key === key && settled.state.webR === webR
      ? settled.state
      : loading;
  return <WebRContext value={state}>{children}</WebRContext>;
}

/** Returns the webR instance of the nearest `WebRProvider` and its status. */
export function useWebR(): WebRState {
  const state = useContext(WebRContext);
  if (!state) throw new Error("webr-fiber needs a <WebRProvider> above");
  return state;
}

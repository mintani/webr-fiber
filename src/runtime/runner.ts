import { useEffect, useLayoutEffect, useRef } from "react";
import type { WebR } from "webr";
import type { Generated } from "../codegen/compose.js";
import { isPlain } from "./plain.js";
import { useWebR } from "./provider.js";

interface Handlers<J extends Generated, R> {
  /** Runs one job in R. */
  run: (webR: WebR, job: J) => Promise<R>;
  /** Called with the result of a job while the component is mounted. */
  onResult: (result: R, job: J) => void;
  /** Called with a result that arrives after the component has unmounted. */
  onDiscard?: (result: R) => void;
  /** Called with the code of a job whenever it differs from the code of the job before. */
  onCode?: ((code: string) => void) | undefined;
  /** Called when a job cannot be made or R fails. Without it the error is logged. */
  onError?: ((error: unknown) => void) | undefined;
}

function sameEntries(
  a: object,
  b: object,
  same: (a: unknown, b: unknown) => boolean = Object.is,
): boolean {
  const entries = Object.entries(b);
  return (
    Object.keys(a).length === entries.length &&
    entries.every(([key, value]) =>
      same((a as Record<string, unknown>)[key], value),
    )
  );
}

/**
 * Whether two bound objects hold the same data. They are compared by value, so that an object
 * that is made again on every render, such as `rows.filter(...)`, does not run R every time.
 */
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) {
    return Object.is(a.getTime(), b.getTime());
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((item, index) => sameData(item, b[index]))
    );
  }
  return isPlain(a) && isPlain(b) && sameEntries(a, b, sameData);
}

/** Two jobs are the same if they have the same code, options and data in their bound objects. */
export function sameJob(a: Generated | null, b: Generated): boolean {
  if (!a) return false;
  const { env: envA, ...restA } = a;
  const { env: envB, ...restB } = b;
  return sameEntries(envA, envB, sameData) && sameEntries(restA, restB);
}

function report(
  error: unknown,
  onError: Handlers<Generated, unknown>["onError"],
): void {
  if (onError) onError(error);
  else console.error(error);
}

/**
 * Runs jobs in R once webR is ready, one at a time. A job is generated code with its bound
 * objects and any options of the caller.
 *
 * The returned function takes a function that makes the next job. A job that equals the one
 * before is skipped, and a job that waits is replaced by a newer one, so that only the latest
 * state runs after R is free again.
 */
export function useRunner<J extends Generated, R>(
  handlers: Handlers<J, R>,
): (make: () => J) => void {
  const { webR, status } = useWebR();
  const latest = useRef({ handlers, webR });
  const state = useRef({
    /** The last job that was taken, run or not. */
    accepted: null as J | null,
    /** The job that R has not started yet. */
    waiting: null as J | null,
    busy: false,
    ready: false,
    mounted: false,
  });

  const runNext = async (): Promise<void> => {
    const queue = state.current;
    const job = queue.waiting;
    if (!job || queue.busy || !queue.ready || !queue.mounted) return;
    queue.waiting = null;
    queue.busy = true;
    try {
      const result = await latest.current.handlers.run(
        latest.current.webR,
        job,
      );
      if (queue.mounted) latest.current.handlers.onResult(result, job);
      else latest.current.handlers.onDiscard?.(result);
    } catch (error) {
      if (queue.mounted) report(error, latest.current.handlers.onError);
    } finally {
      queue.busy = false;
    }
    void runNext();
  };

  useLayoutEffect(() => {
    latest.current = { handlers, webR };
  });

  useEffect(() => {
    const queue = state.current;
    queue.mounted = true;
    return () => {
      queue.mounted = false;
    };
  }, []);

  useEffect(() => {
    state.current.ready = status === "ready";
    void runNext();
  });

  // This runs during the commit of the caller, before `latest` is updated, so the handlers of
  // the current render are used directly.
  return (make) => {
    const queue = state.current;
    let job: J;
    try {
      job = make();
    } catch (error) {
      report(error, handlers.onError);
      return;
    }
    if (sameJob(queue.accepted, job)) return;
    if (queue.accepted?.code !== job.code) handlers.onCode?.(job.code);
    queue.accepted = job;
    queue.waiting = job;
    void runNext();
  };
}

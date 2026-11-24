import type { ReactNode } from "react";
import createReconciler from "react-reconciler";
import constants from "react-reconciler/constants.js";
import type { RNode } from "../codegen/compose.js";

/** A node of the element tree. React changes it in place on later commits. */
export interface Instance extends RNode {
  props: Record<string, unknown>;
  children: Instance[];
}

type CommitHandler = (roots: readonly RNode[]) => void;

interface Container {
  children: Instance[];
  onCommit: CommitHandler;
}

// `@types/react-reconciler` describes 0.28, so the part of 0.34 that is used is typed here.
type ErrorHandler = (error: unknown) => void;
interface Reconciler {
  createContainer(
    container: Container,
    tag: number,
    hydrationCallbacks: null,
    isStrictMode: boolean,
    concurrentUpdatesByDefaultOverride: null,
    identifierPrefix: string,
    onUncaughtError: ErrorHandler,
    onCaughtError: ErrorHandler,
    onRecoverableError: ErrorHandler,
    onDefaultTransitionIndicator: () => void,
  ): object;
  updateContainerSync(
    element: ReactNode,
    root: object,
    parentComponent: null,
    callback: null,
  ): void;
  flushSyncWork(): void;
}

const NO_EVENT_PRIORITY = 0;
let updatePriority = NO_EVENT_PRIORITY;

function withoutReserved(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const { children: _children, ref: _ref, ...rest } = props;
  return rest;
}

function insert(
  siblings: Instance[],
  child: Instance,
  before?: Instance,
): void {
  const current = siblings.indexOf(child);
  if (current !== -1) siblings.splice(current, 1);
  if (before === undefined) siblings.push(child);
  else siblings.splice(siblings.indexOf(before), 0, child);
}

function remove(siblings: Instance[], child: Instance): void {
  const index = siblings.indexOf(child);
  if (index !== -1) siblings.splice(index, 1);
}

const noop = (): void => {};

const hostConfig = {
  supportsMutation: true,
  supportsMicrotasks: true,
  isPrimaryRenderer: false,
  noTimeout: -1,

  createInstance: (type: string, props: Record<string, unknown>): Instance => ({
    type,
    props: withoutReserved(props),
    children: [],
  }),
  createTextInstance(text: string): never {
    throw new Error(
      `Text cannot be a child of an R element: ${JSON.stringify(text)}`,
    );
  },
  shouldSetTextContent: () => false,
  finalizeInitialChildren: () => false,
  getPublicInstance: (instance: Instance) => instance,

  appendInitialChild: (parent: Instance, child: Instance) =>
    insert(parent.children, child),
  appendChild: (parent: Instance, child: Instance) =>
    insert(parent.children, child),
  appendChildToContainer: (container: Container, child: Instance) =>
    insert(container.children, child),
  insertBefore: (parent: Instance, child: Instance, before: Instance) =>
    insert(parent.children, child, before),
  insertInContainerBefore: (
    container: Container,
    child: Instance,
    before: Instance,
  ) => insert(container.children, child, before),
  removeChild: (parent: Instance, child: Instance) =>
    remove(parent.children, child),
  removeChildFromContainer: (container: Container, child: Instance) =>
    remove(container.children, child),
  clearContainer(container: Container): void {
    container.children.length = 0;
  },
  commitUpdate(
    instance: Instance,
    _type: string,
    _previous: Record<string, unknown>,
    next: Record<string, unknown>,
  ): void {
    instance.props = withoutReserved(next);
  },

  getRootHostContext: () => ({}),
  getChildHostContext: (context: object) => context,
  prepareForCommit: () => null,
  resetAfterCommit(container: Container): void {
    container.onCommit(container.children);
  },

  getCurrentUpdatePriority: () => updatePriority,
  setCurrentUpdatePriority(priority: number): void {
    updatePriority = priority;
  },
  resolveUpdatePriority: () => updatePriority || constants.DefaultEventPriority,
  // The tree is never updated from inside an event of its own.
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  trackSchedulerEvent: noop,
  shouldAttemptEagerTransition: () => false,
  maySuspendCommit: () => false,

  scheduleMicrotask: queueMicrotask,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,

  preparePortalMount: noop,
  detachDeletedInstance: noop,
  requestPostPaintCallback: noop,
  resetFormInstance: noop,
  hideInstance: noop,
  unhideInstance: noop,
};

export const reconciler = (
  createReconciler as unknown as (config: typeof hostConfig) => Reconciler
)(hostConfig);

/** Creates the React root of an empty element tree. `onCommit` is called after each commit. */
export function createRoot(
  onCommit: CommitHandler,
  onUncaughtError: ErrorHandler,
): object {
  const container: Container = { children: [], onCommit };
  return reconciler.createContainer(
    container,
    constants.ConcurrentRoot,
    null,
    false,
    null,
    "",
    onUncaughtError,
    noop,
    noop,
    noop,
  );
}

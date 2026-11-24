import { FiberProvider, useContextBridge } from "its-fine";
import { Component, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { RNode } from "../codegen/compose.js";
import { createRoot, reconciler } from "./host-config.js";

interface RootProps {
  children?: ReactNode;
  /**
   * Called after each commit of the element tree, also when nothing changed.
   * React changes the nodes in place later, so they must be used before returning.
   */
  onCommit: (roots: readonly RNode[]) => void;
}

interface BoundaryProps {
  children?: ReactNode;
  onError: (error: unknown) => void;
}

/** Catches errors of the element tree, so that they can be thrown again in the surrounding tree. */
class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function Tree({ children, onCommit }: RootProps): null {
  const Bridge = useContextBridge();
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  if (failure) throw failure.error;

  const fail = (error: unknown): void => setFailure({ error });
  const report = useRef<RootProps["onCommit"] | null>(null);
  const root = useRef<object | null>(null);

  // Rendering in a layout effect commits the element tree in the same tick as the surrounding tree.
  useLayoutEffect(() => {
    report.current = onCommit;
    root.current ??= createRoot((roots) => report.current?.(roots), fail);
    reconciler.updateContainerSync(
      <Bridge>
        <Boundary onError={fail}>{children}</Boundary>
      </Bridge>,
      root.current,
      null,
      null,
    );
    reconciler.flushSyncWork();
  });

  useLayoutEffect(
    () => () => {
      report.current = null;
      if (root.current === null) return;
      reconciler.updateContainerSync(null, root.current, null, null);
      reconciler.flushSyncWork();
      root.current = null;
    },
    [],
  );

  return null;
}

/**
 * Renders lowercase JSX tags into a tree of R function calls instead of DOM elements.
 * Context of the surrounding tree is visible inside, and errors reach its error boundaries.
 */
export function Root(props: RootProps): ReactNode {
  return (
    <FiberProvider>
      <Tree {...props} />
    </FiberProvider>
  );
}

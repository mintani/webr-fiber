import { composerOf } from "./catalogue.js";
import { quoteFunctionName, quoteName, toCode } from "./literal.js";

/** One R function call described as data. */
export interface RNode {
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly RNode[];
}

/** Generated R code and the values it refers to by name. */
export interface Generated {
  code: string;
  env: Record<string, unknown>;
}

type Bind = (value: object) => string;

function namedArguments(
  props: Readonly<Record<string, unknown>>,
  bind: Bind,
): string[] {
  return Object.entries(props)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${quoteName(name)} = ${toCode(value, bind)}`);
}

function expression(node: RNode, bind: Bind): string {
  const [statement, ...rest] = compose(node, bind);
  if (statement === undefined || rest.length > 0) {
    throw new TypeError(
      `<${node.type}> produces several statements and cannot be used as an argument`,
    );
  }
  return statement;
}

function compose(node: RNode, bind: Bind): string[] {
  const children = () => node.children.map((child) => expression(child, bind));

  if (node.type === "call") {
    const { fn, args = [], ...props } = node.props;
    if (typeof fn !== "string")
      throw new TypeError("<call> needs a string `fn` prop");
    if (!Array.isArray(args))
      throw new TypeError("<call> needs an array `args` prop");
    const positional = Array.from(args, (value) => toCode(value, bind));
    const all = [...positional, ...children(), ...namedArguments(props, bind)];
    return [`${quoteFunctionName(fn)}(${all.join(", ")})`];
  }

  const fn = quoteFunctionName(node.type);
  const named = () => namedArguments(node.props, bind);
  switch (composerOf(node.type)) {
    case "plus":
      return [[`${fn}(${named().join(", ")})`, ...children()].join(" + ")];
    case "sequence":
      return [
        `${fn}(${named().join(", ")})`,
        ...node.children.flatMap((child) => compose(child, bind)),
      ];
    default:
      return [`${fn}(${[...children(), ...named()].join(", ")})`];
  }
}

/**
 * Generates R code from one node or a list of nodes.
 *
 * Objects found in props are not written into the code. They are collected in `env` under
 * generated names (`.d1`, `.d2`, ...) and the code refers to them by those names. The same tree
 * always produces the same code and names.
 */
export function generate(root: RNode | readonly RNode[]): Generated {
  const names = new Map<object, string>();
  const env: Record<string, unknown> = {};
  const bind: Bind = (value) => {
    let name = names.get(value);
    if (name === undefined) {
      name = `.d${names.size + 1}`;
      names.set(value, name);
      env[name] = value;
    }
    return name;
  };
  const roots: readonly RNode[] = Array.isArray(root) ? root : [root];
  return { code: roots.flatMap((node) => compose(node, bind)).join("\n"), env };
}

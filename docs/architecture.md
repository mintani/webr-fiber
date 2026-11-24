# Architecture

webr-fiber turns a React element tree into R code and runs it with webR. This document describes the parts that exist. Today that is code generation; the React renderer and the webR runtime are not implemented yet.

## Code generation

Code generation is pure TypeScript in `src/codegen/`. It does not depend on React or webR.

```ts
import { generate, r } from "webr-fiber";

const { code, env } = generate({
  type: "ggplot",
  props: { data: mtcars, mapping: r`aes(x = wt, y = mpg)` },
  children: [{ type: "geom_point", props: { size: 3 }, children: [] }],
});
// code: ggplot(data = .d1, mapping = aes(x = wt, y = mpg)) + geom_point(size = 3)
// env:  { ".d1": mtcars }
```

| Item   | Shape                                            | Meaning                                      |
| ------ | ------------------------------------------------ | -------------------------------------------- |
| Input  | `RNode { type, props, children }`, or a list     | One R function call per node                 |
| Output | `{ code: string, env: Record<string, unknown> }` | R code, and the objects it refers to by name |

A list of nodes becomes one statement per node, separated by line breaks.

### Values

Props, `args` of `<call>` and values interpolated into `r` all follow the same rules.

| JavaScript value                     | R code              | Notes                                                            |
| ------------------------------------ | ------------------- | ---------------------------------------------------------------- |
| Number                               | `3`                 | `NaN` and infinite numbers become `NA`                           |
| String                               | `"a"`               | Escaped with `JSON.stringify`, whose escapes are valid in R      |
| Boolean                              | `TRUE`, `FALSE`     |                                                                  |
| `null`                               | `NULL`              |                                                                  |
| Array of the values above            | `c(1, 2)`           | `null`, `undefined` and holes become `NA`, so the length is kept |
| `` r`...` ``                         | The text as written | See [R expressions](#r-expressions)                              |
| Any other object, including an array | `.d1`, `.d2`, ...   | See [Environment](#environment)                                  |
| `undefined`                          | Nothing             | The prop is left out. In `args` or inside `r` it is an error     |
| Function, symbol, bigint             | Error               |                                                                  |

R strings cannot hold a NUL character or an unpaired surrogate. A string that contains one is an error, because the generated code would fail in R.

### R expressions

The `r` tagged template writes R code that is inserted without quoting.

```ts
r`aes(x = wt, y = mpg)`;
r`gsub("\\d", "", x)`; // R receives "\\d"
r`aes(x = \`Sepal Length\`)`; // R receives `Sepal Length`
r`subset(${data}, cyl == ${4} & name == ${"Fiat"})`; // subset(.d1, cyl == 4 & name == "Fiat")
```

- The text is taken as written. R escapes need no extra backslash.
- A backtick and `${` have to be escaped in a JavaScript template. That escape is removed.
- Interpolated values are converted by the rules in [Values](#values). A string is quoted, so it is never run as code. To insert a name, interpolate another expression: `` r`aes(x = ${r`wt`})` ``.

### Names

Function names and argument names are used as they are when they are valid R names: letters, digits, `.` and `_`, starting with a letter or with a dot that is not followed by a digit or another dot, and not a reserved word. Any other name is quoted with backticks.

| Name            | R code          |
| --------------- | --------------- |
| `na.rm`         | `na.rm`         |
| `data-x`        | `` `data-x` ``  |
| `if`            | `` `if` ``      |
| `stats::t.test` | `stats::t.test` |

A function name may contain `::` or `:::`. The package and the function are quoted separately.

### Composers

A composer decides how a node and its children are combined.

| Composer   | Used for               | Result                                                                     |
| ---------- | ---------------------- | -------------------------------------------------------------------------- |
| Call       | Types without an entry | `fn(child, ..., name = value, ...)`: children are positional arguments     |
| `plus`     | `ggplot`               | `fn(name = value, ...) + child + ...`                                      |
| `sequence` | `plot`                 | `fn(name = value, ...)`, then each child as its own statement              |
| `<call>`   | The node type `call`   | `fn(args..., child, ..., name = value, ...)` with the name taken from `fn` |

- Named arguments keep the order in which the props were written.
- `<call fn="stats::t.test" args={[x, y]} paired />` is for functions that need positional arguments or a name that JSX cannot express.
- A node that produces several statements cannot be used as an argument of another call. This is an error.

`extend()` registers a composer for more function names:

```ts
import { extend } from "webr-fiber";

extend({ hist: "sequence" });
```

### Environment

Objects are not written into the code. Each one is stored in `env` under a generated name, and the code refers to it by that name.

- Names are `.d1`, `.d2`, ... in the order in which the objects appear in the code.
- The same object, compared by identity, gets one name however often it is used.
- Generating the same tree again produces the same code and the same names.

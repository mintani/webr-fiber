import { describe, expect, test } from "vitest";
import { extend } from "./catalogue.js";
import { generate } from "./compose.js";
import type { RNode } from "./compose.js";
import { r } from "./literal.js";

const h = (
  type: string,
  props: Record<string, unknown> = {},
  ...children: RNode[]
): RNode => ({
  type,
  props,
  children,
});

const mtcars = [
  { wt: 2.62, mpg: 21 },
  { wt: 2.875, mpg: 21 },
];

describe("function calls", () => {
  test("writes props as named arguments in their written order", () => {
    const { code, env } = generate(
      h("geom_point", { size: 3, colour: "red", "na.rm": true }),
    );
    expect(code).toMatchInlineSnapshot(
      `"geom_point(size = 3, colour = "red", na.rm = TRUE)"`,
    );
    expect(env).toEqual({});
  });

  test("leaves out undefined props and keeps null", () => {
    expect(
      generate(h("theme", { text: undefined, title: null })).code,
    ).toMatchInlineSnapshot(`"theme(title = NULL)"`);
  });

  test("quotes names that are not valid in R", () => {
    expect(
      generate(h("my fn", { "data-x": 1, if: 2, "legend.position": "none" }))
        .code,
    ).toMatchInlineSnapshot(
      `"\`my fn\`(\`data-x\` = 1, \`if\` = 2, legend.position = "none")"`,
    );
  });

  test("passes children as positional arguments before the props", () => {
    const data = { x: [1, 2, 3] };
    const { code, env } = generate(
      h("print", { digits: 3 }, h("summary", { object: data })),
    );
    expect(code).toMatchInlineSnapshot(
      `"print(summary(object = .d1), digits = 3)"`,
    );
    expect(env[".d1"]).toBe(data);
  });
});

describe("call", () => {
  test("puts args before named props and accepts pkg::fn", () => {
    const x = { values: [1, 2] };
    const y = { values: [3, 4] };
    const { code, env } = generate(
      h("call", { fn: "stats::t.test", args: [x, y], paired: true }),
    );
    expect(code).toMatchInlineSnapshot(
      `"stats::t.test(.d1, .d2, paired = TRUE)"`,
    );
    expect(env).toEqual({ ".d1": x, ".d2": y });
  });

  test("puts children between args and named props", () => {
    expect(
      generate(
        h("call", { fn: "t.test", args: [1], mu: 0 }, h("rnorm", { n: 10 })),
      ).code,
    ).toMatchInlineSnapshot(`"t.test(1, rnorm(n = 10), mu = 0)"`);
  });

  test("needs a string fn and an array args", () => {
    expect(() => generate(h("call"))).toThrow(TypeError);
    expect(() => generate(h("call", { fn: "f", args: 1 }))).toThrow(TypeError);
  });
});

describe("plus", () => {
  test("joins the node and its children with +", () => {
    const { code, env } = generate(
      h(
        "ggplot",
        { data: mtcars, mapping: r`aes(x = wt, y = mpg)` },
        h("geom_point", { size: 3 }),
        h("geom_smooth", { method: "lm" }),
      ),
    );
    expect(code).toMatchInlineSnapshot(
      `"ggplot(data = .d1, mapping = aes(x = wt, y = mpg)) + geom_point(size = 3) + geom_smooth(method = "lm")"`,
    );
    expect(env).toEqual({ ".d1": mtcars });
  });

  test("is only the node when there are no children", () => {
    expect(generate(h("ggplot")).code).toMatchInlineSnapshot(`"ggplot()"`);
  });
});

describe("sequence", () => {
  test("writes the node and each child as separate statements", () => {
    expect(
      generate(
        h(
          "plot",
          { x: [1, 2, 3], y: [2, 4, 8] },
          h("lines", { x: [1, 3], y: [2, 8] }),
          h("abline", { h: 4, lty: 2 }),
        ),
      ).code,
    ).toMatchInlineSnapshot(`
      "plot(x = c(1, 2, 3), y = c(2, 4, 8))
      lines(x = c(1, 3), y = c(2, 8))
      abline(h = 4, lty = 2)"
    `);
  });

  test("cannot be used as an argument when it has children", () => {
    expect(() =>
      generate(h("print", {}, h("plot", {}, h("abline", { h: 0 })))),
    ).toThrow("<plot> produces several statements");
  });
});

describe("catalogue", () => {
  test.each([
    "hist",
    "barplot",
    "boxplot",
    "pie",
    "curve",
    "pairs",
    "coplot",
    "matplot",
    "dotchart",
    "image",
    "contour",
    "persp",
    "qqnorm",
    "qqplot",
  ])("%s starts a plot that its children add to", (type) => {
    expect(generate(h(type, { x: [1, 2] }, h("abline", { v: 2 }))).code).toBe(
      `${type}(x = c(1, 2))\nabline(v = 2)`,
    );
  });

  test("uses the composer of the function for pkg::fn", () => {
    expect(
      generate([
        h("ggplot2::ggplot", {}, h("ggplot2::geom_point")),
        h("graphics::hist", { x: [1, 2] }, h("graphics::abline", { v: 2 })),
        h("stats:::plot.lm", {}, h("abline", { h: 0 })),
      ]).code,
    ).toMatchInlineSnapshot(`
      "ggplot2::ggplot() + ggplot2::geom_point()
      graphics::hist(x = c(1, 2))
      graphics::abline(v = 2)
      stats:::plot.lm(abline(h = 0))"
    `);
  });
});

describe("extend", () => {
  test("registers a composer for another function", () => {
    const tree = h("stripchart", { x: [1, 2, 2] }, h("abline", { v: 2 }));
    expect(generate(tree).code).toMatchInlineSnapshot(
      `"stripchart(abline(v = 2), x = c(1, 2, 2))"`,
    );
    extend({ stripchart: "sequence" });
    expect(generate(tree).code).toMatchInlineSnapshot(`
      "stripchart(x = c(1, 2, 2))
      abline(v = 2)"
    `);
  });

  test("prefers an entry for the full name over the entry of the function", () => {
    extend({ "mypkg::plot": "plus" });
    expect(
      generate(h("mypkg::plot", {}, h("ggplot"))).code,
    ).toMatchInlineSnapshot(`"mypkg::plot() + ggplot()"`);
  });

  test("does not accept call", () => {
    expect(() => extend({ call: "plus" })).toThrow(TypeError);
  });
});

describe("r expression", () => {
  test("is generated as it is, with its objects bound", () => {
    expect(generate(r`coef(lm(mpg ~ wt, data = ${mtcars}))[${"wt"}]`)).toEqual({
      code: 'coef(lm(mpg ~ wt, data = .d1))["wt"]',
      env: { ".d1": mtcars },
    });
  });
});

describe("environment", () => {
  test("names objects in the order they appear and reuses the name of the same object", () => {
    const other = [{ wt: 3 }];
    const { code, env } = generate([
      h(
        "ggplot",
        { data: mtcars },
        h("geom_point", { data: other }),
        h("geom_line", { data: mtcars }),
      ),
      h("print", { x: other }),
    ]);
    expect(code).toMatchInlineSnapshot(`
      "ggplot(data = .d1) + geom_point(data = .d2) + geom_line(data = .d1)
      print(x = .d2)"
    `);
    expect(env).toEqual({ ".d1": mtcars, ".d2": other });
    expect(env[".d1"]).toBe(mtcars);
  });

  test("generates the same code and names for the same tree", () => {
    const tree = h(
      "ggplot",
      { data: mtcars },
      h("geom_point", { data: [{ wt: 1 }] }),
    );
    expect(generate(tree)).toEqual(generate(tree));
  });
});

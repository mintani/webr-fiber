import { describe, expect, test } from "vitest";
import { quoteFunctionName, quoteName, r, toCode } from "./literal.js";

const noBinding = (): string => {
  throw new Error("unexpected binding");
};
const code = (value: unknown) => toCode(value, noBinding);

describe("literals", () => {
  test.each([
    [3, "3"],
    [0.5, "0.5"],
    [-2, "-2"],
    [1e21, "1e+21"],
    [Number.NaN, "NA"],
    [Number.POSITIVE_INFINITY, "NA"],
    [Number.NEGATIVE_INFINITY, "NA"],
    [true, "TRUE"],
    [false, "FALSE"],
    [null, "NULL"],
    ["a", '"a"'],
    ['say "hi"\n', '"say \\"hi\\"\\n"'],
    ["C:\\data", '"C:\\\\data"'],
    ["\u0007", '"\\u0007"'],
    ["日本語 😀", '"日本語 😀"'],
  ])("%j becomes %s", (value, expected) => {
    expect(code(value)).toBe(expected);
  });

  test.each([
    [[1, 2], "c(1, 2)"],
    [["a", true, 1], 'c("a", TRUE, 1)'],
    [[1, null, 3], "c(1, NA, 3)"],
    [[1, undefined, 3], "c(1, NA, 3)"],
    // oxlint-disable-next-line no-sparse-arrays -- a hole must behave like undefined
    [[1, , 3], "c(1, NA, 3)"],
    [[Number.NaN], "c(NA)"],
    [[], "c()"],
  ])("array %j becomes %s", (value, expected) => {
    expect(code(value)).toBe(expected);
  });

  test.each(["a\0b", "\uD83D", "x\uDE00"])("rejects the string %j", (value) => {
    expect(() => code(value)).toThrow(TypeError);
  });

  test.each([undefined, () => 1, Symbol("s"), 1n])("rejects %s", (value) => {
    expect(() => code(value)).toThrow(TypeError);
  });
});

describe("r template", () => {
  test("inserts the text without quoting", () => {
    expect(code(r`aes(x = wt, y = mpg)`)).toBe("aes(x = wt, y = mpg)");
  });

  test("keeps backslashes as written", () => {
    expect(code(r`gsub("\\d", "", x)`)).toBe('gsub("\\\\d", "", x)');
  });

  test("drops the escape of a backtick and of ${", () => {
    expect(code(r`aes(x = \`Sepal Length\`)`)).toBe("aes(x = `Sepal Length`)");
    expect(code(r`"\${x}"`)).toBe('"${x}"');
  });

  test("converts interpolated values like prop values", () => {
    const data = [{ cyl: 4 }];
    const bind = (value: object) => (value === data ? ".d1" : "?");
    expect(
      toCode(r`subset(${data}, cyl == ${4} & name == ${"Fiat"})`, bind),
    ).toBe('subset(.d1, cyl == 4 & name == "Fiat")');
  });

  test("inserts a nested expression as is", () => {
    expect(code(r`aes(x = ${r`wt`})`)).toBe("aes(x = wt)");
    expect(code([r`a`, 1])).toBe("c(a, 1)");
  });

  test("rejects an undefined interpolation", () => {
    expect(() => code(r`f(${undefined})`)).toThrow(TypeError);
  });
});

describe("objects", () => {
  test.each([
    ["an object", { a: 1 }],
    ["an array of objects", [{ a: 1 }, { a: 2 }]],
    ["an array of arrays", [[1], [2]]],
  ])("binds %s", (_label, value) => {
    const bound: object[] = [];
    const name = toCode(value, (object) => {
      bound.push(object);
      return ".d1";
    });
    expect(name).toBe(".d1");
    expect(bound).toEqual([value]);
    expect(bound[0]).toBe(value);
  });
});

describe("names", () => {
  test.each(["x", "na.rm", ".x", "x_1", ".", "legend.position", "T"])(
    "keeps %s",
    (name) => {
      expect(quoteName(name)).toBe(name);
    },
  );

  test.each([
    ["my var", "`my var`"],
    ["1x", "`1x`"],
    ["_x", "`_x`"],
    [".2x", "`.2x`"],
    ["...", "`...`"],
    ["..1", "`..1`"],
    ["if", "`if`"],
    ["TRUE", "`TRUE`"],
    ["data-x", "`data-x`"],
    ["a`b", "`a\\`b`"],
    ["a\\b", "`a\\\\b`"],
    ["名前", "`名前`"],
  ])("quotes %s", (name, expected) => {
    expect(quoteName(name)).toBe(expected);
  });

  test.each(["", "a\0b"])("rejects the name %j", (name) => {
    expect(() => quoteName(name)).toThrow(TypeError);
  });

  test.each([
    ["t.test", "t.test"],
    ["stats::t.test", "stats::t.test"],
    ["stats:::Pillai", "stats:::Pillai"],
    ["base::[", "base::`[`"],
    ["my fn", "`my fn`"],
    ["pkg::my fn", "pkg::`my fn`"],
  ])("function name %s becomes %s", (name, expected) => {
    expect(quoteFunctionName(name)).toBe(expected);
  });
});

import { expect, test } from "vitest";
import { aes } from "./aes.js";
import { generate } from "./compose.js";
import { r } from "./literal.js";

const code = (mapping: Record<string, unknown>) =>
  generate({ type: "ggplot", props: { mapping: aes(mapping) }, children: [] });

test("writes strings as column names in their written order", () => {
  expect(code({ x: "wt", y: "mpg" }).code).toBe(
    "ggplot(mapping = aes(x = wt, y = mpg))",
  );
});

test("quotes column names that are not valid R names", () => {
  expect(code({ x: "Sepal Length", y: "if" }).code).toBe(
    "ggplot(mapping = aes(x = `Sepal Length`, y = `if`))",
  );
});

test("converts other values like prop values", () => {
  const weights = { values: [1, 2] };
  const { code: generated, env } = code({
    colour: r`factor(cyl)`,
    size: 3,
    weight: r`${weights}$values`,
    label: r`"car"`,
  });
  expect(generated).toBe(
    'ggplot(mapping = aes(colour = factor(cyl), size = 3, weight = .d1$values, label = "car"))',
  );
  expect(env).toEqual({ ".d1": weights });
});

test("leaves out undefined entries", () => {
  expect(code({ x: "wt", colour: undefined, y: "mpg" }).code).toBe(
    "ggplot(mapping = aes(x = wt, y = mpg))",
  );
  expect(code({}).code).toBe("ggplot(mapping = aes())");
});

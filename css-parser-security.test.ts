import { expect, test } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const typographyRequire = createRequire(
  require.resolve("@tailwindcss/typography"),
);

test("Tailwind typography actually loads the patched selector parser", () => {
  const packageInfo = typographyRequire(
    "postcss-selector-parser/package.json",
  ) as { version: string };
  expect(packageInfo.version).toBe("7.1.6");
});

test("flat and normal prose selectors preserve their exact source", () => {
  const parser = typographyRequire("postcss-selector-parser") as () => {
    processSync: (selector: string) => string;
  };
  for (const selector of [
    ".a".repeat(40000),
    '.prose :where(p):not(:where([class~="not-prose"] *))',
    '.a[data-value="a,b"] > :is(.b, #c)::before',
  ]) {
    expect(parser().processSync(selector)).toBe(selector);
  }
});

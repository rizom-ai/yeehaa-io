import { describe, expect, it } from "bun:test";
import site from "../src/site";

// Yeehaa's own chrome over the default theme: plain words in the header and
// footer, and a slim bar on a phone, where the screen is short.
describe("yeehaa site chrome", () => {
  const css = site.themeOverride;

  it("sets the header menu and footer labels in the body face, not spaced capitals", () => {
    expect(css).toMatch(/\.nav-link \{[^}]*font-family: var\(--font-body\)/);
    expect(css).toMatch(/\.nav-link \{[^}]*text-transform: none/);
    expect(css).toMatch(
      /footer \.font-mono\.uppercase \{[^}]*text-transform: none/,
    );
  });

  it("keeps the phone header slim", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 47.99rem)"));
    expect(phone).toMatch(/header\.sticky \{[^}]*padding-block: \.6rem/);
  });
});

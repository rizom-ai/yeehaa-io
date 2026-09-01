import { describe, expect, it } from "bun:test";

const active = Bun.YAML.parse(
  await Bun.file(new URL("../brain.yaml", import.meta.url)).text(),
) as Record<string, unknown>;
const reviewedTarget = Bun.YAML.parse(
  await Bun.file(
    new URL("../migration/capability-bundles-v1/brain.yaml", import.meta.url),
  ).text(),
) as Record<string, unknown>;

describe("active capability-bundle contract", () => {
  it("exactly matches the reviewed professional migration target", () => {
    expect(active).toEqual(reviewedTarget);
    expect(active["bundleContract"]).toBe("capability-bundles-v1");
    expect(active["bundles"]).toEqual([
      "core",
      "media",
      "automation",
      "web",
      "chat",
      "site",
      "publishing",
      "federation",
    ]);
  });

  it("preserves every configured plugin block under the canonical names", () => {
    const activePlugins = active["plugins"] as Record<string, unknown>;
    const targetPlugins = reviewedTarget["plugins"] as Record<string, unknown>;

    expect(Object.keys(activePlugins)).toHaveLength(11);
    expect(activePlugins).toEqual(targetPlugins);
    expect(activePlugins["studio"]).toEqual({
      passkeyLogin: { contentRepoToken: "${CMS_CONTENT_REPO_PAT}" },
    });
    expect(activePlugins["cms"]).toBeUndefined();
  });
});

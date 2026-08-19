import { describe, expect, it } from "bun:test";

const source = Bun.YAML.parse(
  await Bun.file(new URL("../brain.yaml", import.meta.url)).text(),
) as Record<string, unknown>;
const target = Bun.YAML.parse(
  await Bun.file(
    new URL("../migration/capability-bundles-v1/brain.yaml", import.meta.url),
  ).text(),
) as Record<string, unknown>;

describe("capability-bundle migration target", () => {
  it("changes only the reviewed composition contract", () => {
    const { bundles: sourceBundles, ...sourceInstance } = source;
    const {
      bundleContract,
      bundles: targetBundles,
      ...targetInstance
    } = target;

    expect(sourceBundles).toEqual(["core", "site", "publishing"]);
    expect(bundleContract).toBe("capability-bundles-v1");
    expect(targetBundles).toEqual([
      "core",
      "media",
      "automation",
      "web",
      "chat",
      "site",
      "publishing",
      "federation",
    ]);
    expect(targetInstance).toEqual(sourceInstance);
  });

  it("preserves every configured plugin block", () => {
    const sourcePlugins = source["plugins"] as Record<string, unknown>;
    const targetPlugins = target["plugins"] as Record<string, unknown>;

    expect(Object.keys(sourcePlugins)).toHaveLength(11);
    expect(targetPlugins).toEqual(sourcePlugins);
  });
});

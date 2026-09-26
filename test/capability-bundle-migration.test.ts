import { describe, expect, it } from "bun:test";

const active = Bun.YAML.parse(
  await Bun.file(new URL("../brain.yaml", import.meta.url)).text(),
) as Record<string, unknown>;
const reviewedTarget = Bun.YAML.parse(
  await Bun.file(
    new URL("../migration/capability-bundles-v1/brain.yaml", import.meta.url),
  ).text(),
) as Record<string, unknown>;

// After the crossover, the deployment adds the public contact door beside the
// atlas homepage, with the owner as its alerts' recipient. Everything else must
// still be the reviewed crossover target.
const {
  contact: activeContact,
  notifications: activeNotifications,
  ...activePlugins
} = active["plugins"] as Record<string, unknown>;
const crossover = {
  ...active,
  add: (active["add"] as string[]).filter((name) => name !== "contact"),
  plugins: activePlugins,
};

describe("active capability-bundle contract", () => {
  it("matches the reviewed professional migration target, plus the contact door", () => {
    expect(crossover).toEqual(reviewedTarget);
    expect(active["add"]).toEqual(["obsidian-vault", "contact"]);
    expect(activeContact).toMatchObject({
      intake: {
        http: { origin: "https://yeehaa.io" },
        inboxUrl: "https://yeehaa.io/studio/workspaces/unified-inbox%3Ainbox",
      },
    });
    // Without a recipient every contact alert fails and waits unseen.
    expect(activeNotifications).toEqual({
      defaultRecipient: { type: "email", address: "${SETUP_EMAIL_TO}" },
    });
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
    const targetPlugins = reviewedTarget["plugins"] as Record<string, unknown>;

    expect(Object.keys(activePlugins)).toHaveLength(11);
    expect(activePlugins).toEqual(targetPlugins);
    expect(activePlugins["studio"]).toEqual({
      passkeyLogin: { contentRepoToken: "${CMS_CONTENT_REPO_PAT}" },
    });
    expect(activePlugins["cms"]).toBeUndefined();
  });
});

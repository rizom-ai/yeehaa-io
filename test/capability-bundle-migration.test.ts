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
    // The plugin derives the intake origin, preview host and Inbox link from
    // the brain's own site, and refuses them as configuration: the web
    // container does not boot with them.
    for (const derived of [
      ["intake", "http", "origin"],
      ["intake", "http", "trustForwardedProto"],
      ["intake", "inboxUrl"],
      ["intake", "preview"],
    ])
      expect(activeContact).not.toHaveProperty(derived);
    expect(activeContact).toMatchObject({
      intake: { delivery: { maxAttempts: 3 } },
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

    expect(Object.keys(activePlugins)).toHaveLength(10);
    expect(activePlugins).toEqual(targetPlugins);
    // Studio takes no configuration here. Its schema is strict, so a leftover
    // key drops Studio (and contact, which depends on it) from the app.
    expect(activePlugins["studio"]).toBeUndefined();
    expect(activePlugins["cms"]).toBeUndefined();
  });
});

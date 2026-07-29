import { describe, expect, it } from "bun:test";

const deployConfig = await Bun.file(
  new URL("../config/deploy.yml", import.meta.url),
).text();

describe("deployment runtime storage", () => {
  it("persists auth state outside disposable containers", () => {
    expect(deployConfig).toContain("- /opt/brain-runtime:/app/data");
  });
});

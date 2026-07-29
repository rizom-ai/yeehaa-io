import { describe, expect, it } from "bun:test";

const deployConfig = await Bun.file(
  new URL("../config/deploy.yml", import.meta.url),
).text();
const deployWorkflow = await Bun.file(
  new URL("../.github/workflows/deploy.yml", import.meta.url),
).text();

describe("deployment runtime storage", () => {
  it("persists auth state outside disposable containers", () => {
    expect(deployConfig).toContain("- /opt/brain-runtime:/app/data");
  });

  it("confirms provider acceptance while first-passkey setup is pending", () => {
    expect(deployWorkflow).toContain("setup_token_deliveries");
    expect(deployWorkflow).toContain(
      "Passkey setup email provider acceptance confirmed",
    );
  });
});

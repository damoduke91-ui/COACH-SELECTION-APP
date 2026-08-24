import { expect, test, type Page } from "@playwright/test";

const previewBaseUrl = process.env.PREVIEW_BASE_URL;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const expectedSeasonYear = process.env.E2E_EXPECTED_SEASON_YEAR ?? "2027";

function requirePreviewConfiguration() {
  if (!previewBaseUrl) throw new Error("PREVIEW_BASE_URL is required.");
  if (!adminEmail || !adminPassword) throw new Error("E2E admin credentials are required.");

  const url = new URL(previewBaseUrl);
  if (url.protocol !== "https:") {
    throw new Error("Preview E2E tests require an HTTPS Preview deployment URL.");
  }
}

async function expectHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test.describe("Preview season rollover smoke test", () => {
  test.beforeAll(() => requirePreviewConfiguration());

  test("reads the active season across admin and coach pages without changing data", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/login");
    await page.getByPlaceholder("Enter email").fill(adminEmail!);
    await page.getByPlaceholder("Enter password").fill(adminPassword!);
    await page.getByRole("button", { name: "Log In" }).click();
    await page.waitForURL("**/dashboard");
    await expectHeading(page, /Dashboard/);

    await page.getByRole("link", { name: /^Ladder\b/ }).click();
    await page.waitForURL("**/ladder");
    await expectHeading(page, `${expectedSeasonYear} Ladder`);
    await expectHeading(page, "Season Ladder");

    await page.getByRole("link", { name: "Back to Dashboard" }).click();
    await page.getByRole("link", { name: /Full Season Fixture/ }).click();
    await page.waitForURL("**/fixture");
    await expectHeading(page, "Full Season Fixture");

    await page.getByRole("link", { name: "Back to Dashboard" }).click();
    await page.getByRole("link", { name: /Full Season Results/ }).click();
    await page.waitForURL("**/results");
    await expectHeading(page, "Full Season Results");

    await page.getByRole("link", { name: "Back to Dashboard" }).click();
    await page.getByRole("link", { name: /Coach Selection/ }).click();
    await page.waitForURL("**/select-team");
    await expectHeading(page, "Coach Team Selection");

    await page.getByRole("button", { name: /Back to Dashboard/ }).click();
    await page.getByRole("button", { name: "Log Out" }).click();
    await page.waitForURL("**/login");
    await expectHeading(page, "Coach Team Login");
  });
});

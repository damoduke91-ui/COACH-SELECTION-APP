import { expect, test, type Page } from "@playwright/test";

const previewBaseUrl = process.env.PREVIEW_BASE_URL;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

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

async function stageFinalsWeek(page: Page, week: number) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Stage Week ${week}` }).click();
  await expect(page.getByText(new RegExp(`Preview Finals Week ${week} staged deterministically`))).toBeVisible();
}

async function resetPreviewFinals(page: Page) {
  page.once("dialog", (dialog) => dialog.accept("RESET PREVIEW FINALS"));
  await page.getByRole("button", { name: "Reset Preview Finals" }).click();
  await expect(page.getByText(/Preview Finals reset complete/)).toBeVisible();
}

test.describe("Preview finals journey", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => requirePreviewConfiguration());

  test("covers login, finals fixtures and labels, navigation, results tabs, reset, and logout", async ({ page }) => {
    const mainFrameUrls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) mainFrameUrls.push(frame.url());
    });

    await page.goto("/login");
    await page.getByPlaceholder("Enter email").fill(adminEmail!);
    await page.getByPlaceholder("Enter password").fill(adminPassword!);
    await page.getByRole("button", { name: "Log In" }).click();
    await page.waitForURL("**/dashboard");
    await expectHeading(page, /Dashboard/);
    await page.waitForTimeout(1_000);

    const dashboardNavigationIndex = mainFrameUrls.findIndex((url) => new URL(url).pathname === "/dashboard");
    expect(dashboardNavigationIndex).toBeGreaterThanOrEqual(0);
    expect(
      mainFrameUrls.slice(dashboardNavigationIndex + 1).map((url) => new URL(url).pathname),
      "login must not flicker back after the dashboard has loaded",
    ).not.toContain("/login");

    await page.getByRole("link", { name: "Finals", exact: true }).click();
    await page.waitForURL("**/finals");
    await expectHeading(page, "Preview Finals Scenarios");
    await stageFinalsWeek(page, 1);
    await expect(page.getByText("To be decided", { exact: true }).first()).toBeVisible();

    await page.getByRole("link", { name: "Back to Dashboard" }).click();
    await page.waitForURL("**/dashboard");

    const currentWeek = page.getByRole("heading", { name: "Current Week Fixture" }).locator("..");
    await expect(currentWeek).toContainText("AFL Round 21, S8 Finals Week 1");
    await expect(currentWeek.getByText(/ vs /).first()).toBeVisible();

    const nextWeek = page.getByRole("heading", { name: "Next Week" }).locator("..");
    await expect(nextWeek).toContainText("AFL Round 22, S8 Finals Week 2");
    await expect(nextWeek.getByText(/ vs /).first()).toBeVisible();

    await page.getByRole("link", { name: /Full Season Fixture/ }).click();
    await page.waitForURL("**/fixture");
    await expectHeading(page, "Full Season Fixture");
    await expectHeading(page, "Finals Fixture");
    await expect(page.getByText("Finals Week 1 / Competition Round 15 / AFL Round 21")).toBeVisible();

    await page.getByRole("link", { name: "Back to Dashboard" }).click();
    await page.getByRole("link", { name: "Ladder", exact: true }).click();
    await page.waitForURL("**/ladder");
    await expectHeading(page, "2026 Ladder");
    await expectHeading(page, "Season Ladder");

    await page.getByRole("link", { name: "Back to Dashboard" }).click();
    await page.getByRole("link", { name: "Full Season Results" }).click();
    await page.waitForURL("**/results");
    await expectHeading(page, "Full Season Results");

    for (let week = 1; week <= 4; week += 1) {
      const tab = page.getByRole("button", { name: `S8 Finals Week ${week}` });
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(page.getByText(`Finals Week ${week}`, { exact: true })).toBeVisible();
    }

    await page.getByRole("link", { name: "Back to Dashboard" }).click();
    await page.getByRole("link", { name: "Finals", exact: true }).click();
    await page.waitForURL("**/finals");
    await expectHeading(page, "Finals Week Readiness");
    await expect(page.getByText("NOT READY", { exact: true })).toBeVisible();

    await stageFinalsWeek(page, 4);
    await expect(page.getByText("Team submissions").locator("..")).toContainText("0/2");
    await resetPreviewFinals(page);
    await expect(page.getByText("Team submissions").locator("..")).toContainText("0/4");
    await expect(page.getByText("AFL stats").locator("..")).toContainText("0/18 clubs");

    await page.getByRole("link", { name: "Back to Dashboard" }).click();
    await page.getByRole("button", { name: "Log Out" }).click();
    await page.waitForURL("**/login");
    await expectHeading(page, "Coach Team Login");
    await expect(page.getByRole("button", { name: "Log In" })).toBeEnabled();
  });
});

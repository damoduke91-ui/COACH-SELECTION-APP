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

async function returnToDashboard(page: Page) {
  const backToDashboard = page
    .getByRole("link", { name: /Back to Dashboard/ })
    .or(page.getByRole("button", { name: /Back to Dashboard/ }));
  await backToDashboard.click();
  await page.waitForURL("**/dashboard");
  await expectHeading(page, /Dashboard/);
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
    test.setTimeout(180_000);

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

    await page.getByRole("link", { name: /Admin Team Audit Log/ }).click();
    await page.waitForURL("**/admin-teams");
    await expectHeading(page, "Admin Team Audit Log");
    await expect(page.getByRole("columnheader", { name: "Time" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Coach" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Action" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Reason" })).toBeVisible();

    await returnToDashboard(page);
    await page.getByRole("link", { name: /Coach Selection/ }).click();
    await page.waitForURL("**/select-team");
    await expectHeading(page, "Coach Team Selection");
    await expectHeading(page, "Admin Controls");
    await expectHeading(page, "Team Controls");
    const teamControls = page.getByRole("heading", { name: "Team Controls" }).locator("..").locator("..");
    await expect(teamControls.getByRole("combobox")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Save for / })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Submit for / })).toBeVisible();

    await returnToDashboard(page);

    await page.getByRole("link", { name: /^Finals\b/ }).click();
    await page.waitForURL("**/finals");
    await expectHeading(page, "Preview Finals Scenarios");
    await stageFinalsWeek(page, 1);
    await expect(page.getByText("To be decided", { exact: true }).first()).toBeVisible();

    await returnToDashboard(page);

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

    await returnToDashboard(page);
    await page.getByRole("link", { name: /^Ladder\b/ }).click();
    await page.waitForURL("**/ladder");
    await expectHeading(page, "2026 Ladder");
    await expectHeading(page, "Season Ladder");

    await returnToDashboard(page);
    await page.getByRole("link", { name: /^Full Season Results\b/ }).click();
    await page.waitForURL("**/results");
    await expectHeading(page, "Full Season Results");

    for (let week = 1; week <= 4; week += 1) {
      const tab = page.getByRole("button", { name: `S8 Finals Week ${week}` });
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(page.getByText(`Finals Week ${week}`, { exact: true })).toBeVisible();
    }

    await returnToDashboard(page);
    await page.getByRole("link", { name: /^Finals\b/ }).click();
    await page.waitForURL("**/finals");
    await expectHeading(page, "Finals Week Readiness");
    await expect(page.getByText("NOT READY", { exact: true })).toBeVisible();

    await stageFinalsWeek(page, 4);
    await expect(page.getByText("Team submissions").locator("..")).toContainText("0/2");
    await resetPreviewFinals(page);
    await expect(page.getByText("Team submissions").locator("..")).toContainText("0/4");
    await expect(page.getByText("AFL stats").locator("..")).toContainText("0/18 clubs");

    await returnToDashboard(page);
    await page.getByRole("button", { name: "Log Out" }).click();
    await page.waitForURL("**/login");
    await expectHeading(page, "Coach Team Login");
    await expect(page.getByRole("button", { name: "Log In" })).toBeEnabled();
  });
});

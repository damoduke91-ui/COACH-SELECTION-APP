import { expect, test } from "@playwright/test";

test("stages and resets Preview Finals while reporting readiness", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("E2E admin credentials are required.");

  await page.goto("/login");
  await page.getByPlaceholder("Enter email").fill(email);
  await page.getByPlaceholder("Enter password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/finals");
  await expect(page.getByRole("heading", { name: "Finals Week Readiness" })).toBeVisible();
  await expect(page.getByText("NOT READY", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Stage Week 4" }).click();
  await expect(page.getByText(/Preview Finals Week 4 staged deterministically/)).toBeVisible();

  page.once("dialog", async (dialog) => dialog.accept("RESET PREVIEW FINALS"));
  await page.getByRole("button", { name: "Reset Preview Finals" }).click();
  await expect(page.getByText(/Preview Finals reset complete/)).toBeVisible();
  await expect(page.getByText("Team submissions").locator("..")).toContainText("0/4");
  await expect(page.getByText("AFL stats").locator("..")).toContainText("0/18 clubs");
});

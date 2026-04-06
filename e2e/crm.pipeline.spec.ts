import { test, expect } from "@playwright/test";
import {
  CONFIG,
  generateTestLead,
  fillFormField,
  getAdminCreds,
  loginAsAdmin,
  navigateTo,
  waitForCreateLeadModal,
} from "./helpers";

/** Authenticated CRM tests — requires a user with dashboard access (e.g. super_admin). */
test.describe("04 — Sales Pipeline / CRM", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const creds = getAdminCreds();
    if (!creds) {
      testInfo.skip(true, "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD.");
      return;
    }
    await loginAsAdmin(page, creds);
  });

  test("Pipeline page loads with Kanban board", async ({ page }) => {
    await navigateTo(page, "/crm");
    await expect(page.getByRole("heading", { name: "Sales Pipeline" })).toBeVisible({ timeout: CONFIG.LOAD_TIMEOUT });

    const stages = ["New", "Contacted", "Viewing", "Offer", "Contract", "Won", "Lost"];
    let visible = 0;
    for (const stage of stages) {
      const head = page.getByText(stage, { exact: true }).first();
      if (await head.isVisible({ timeout: 3000 }).catch(() => false)) visible += 1;
    }
    expect(visible).toBeGreaterThanOrEqual(3);
  });

  test("Pipeline has both Kanban and List view toggle", async ({ page }) => {
    await navigateTo(page, "/crm");
    await expect(page.getByRole("button", { name: /kanban/i })).toBeVisible({ timeout: CONFIG.LOAD_TIMEOUT });
    await expect(page.getByRole("button", { name: /list/i })).toBeVisible();
  });

  test("Create a new lead from pipeline", async ({ page }) => {
    await navigateTo(page, "/crm");
    const lead = generateTestLead();

    await page.getByRole("button", { name: /new lead/i }).click();
    await waitForCreateLeadModal(page);

    await fillFormField(page, "company", lead.companyName);
    await fillFormField(page, "name", lead.contactName);
    await fillFormField(page, "email", lead.email);

    await page.getByRole("button", { name: /create lead/i }).click();

    await expect(page.getByText(lead.companyName, { exact: false }).first()).toBeVisible({
      timeout: CONFIG.ACTION_TIMEOUT,
    });
  });

  test("Clicking a lead card opens detail view", async ({ page }) => {
    await navigateTo(page, "/crm");

    const leadCard = page.locator('[draggable="true"]').first();
    if (await leadCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await leadCard.click();
      await expect(page.getByRole("heading", { name: "Edit Lead" })).toBeVisible({ timeout: CONFIG.ACTION_TIMEOUT });
    }
  });

  test("Kanban shows multiple stage columns", async ({ page }) => {
    await navigateTo(page, "/crm");

    const stages = ["New", "Contacted", "Viewing", "Offer", "Contract", "Won", "Lost"];
    let visible = 0;
    for (const stage of stages) {
      const el = page.getByText(stage, { exact: true }).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) visible += 1;
    }
    expect(visible).toBeGreaterThanOrEqual(3);
  });

  test("Offer-related UI exists on pipeline", async ({ page }) => {
    await navigateTo(page, "/crm");
    await expect(page.getByText("Offer", { exact: true }).first()).toBeVisible({ timeout: CONFIG.LOAD_TIMEOUT });
  });

  test("Contract-related UI exists on pipeline", async ({ page }) => {
    await navigateTo(page, "/crm");
    await expect(page.getByText("Contract", { exact: true }).first()).toBeVisible({ timeout: CONFIG.LOAD_TIMEOUT });
  });

  test("List view shows lead data in table format", async ({ page }) => {
    await navigateTo(page, "/crm");
    await page.getByRole("button", { name: /list/i }).click();
    await expect(page.locator("table").first()).toBeVisible({ timeout: CONFIG.LOAD_TIMEOUT });
  });

  test("Pipeline toolbar has search and filters", async ({ page }) => {
    await navigateTo(page, "/crm");
    await expect(page.getByPlaceholder(/search companies/i)).toBeVisible({ timeout: CONFIG.LOAD_TIMEOUT });
  });
});

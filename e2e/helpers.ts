import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Timeouts for CRM / dashboard flows (ms). */
export const CONFIG = {
  ACTION_TIMEOUT: 15_000,
  LOAD_TIMEOUT: 45_000,
} as const;

export type AdminCreds = { email: string; password: string };

export function getAdminCreds(): AdminCreds | null {
  const email = (process.env.PLAYWRIGHT_ADMIN_EMAIL ?? "").trim();
  const password = (process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "").trim();
  if (!email || !password) return null;
  return { email, password };
}

export async function loginAsAdmin(page: Page, creds: AdminCreds): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: CONFIG.LOAD_TIMEOUT });
}

export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
}

/** Create-lead modal uses headings, not role="dialog". */
export async function waitForCreateLeadModal(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "New Lead" })).toBeVisible({ timeout: CONFIG.LOAD_TIMEOUT });
}

export function generateTestLead(): { companyName: string; contactName: string; email: string } {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    companyName: `E2E Pipeline ${id}`,
    contactName: "E2E Contact",
    email: `e2e-pipeline-${id}@example.invalid`,
  };
}

/**
 * Best-effort field fill for the CRM "New Lead" modal (labels are not wired with htmlFor).
 */
export async function fillFormField(page: Page, field: "company" | "name" | "email", value: string): Promise<void> {
  if (field === "company") {
    await page.getByPlaceholder("e.g. Acme Oy").fill(value);
    return;
  }

  if (field === "email") {
    await page.getByPlaceholder("name@company.com").fill(value);
    return;
  }

  const parts = value.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ") || "User";

  await page
    .getByText("First name", { exact: true })
    .locator("..")
    .locator("input")
    .first()
    .fill(first);
  await page
    .getByText("Last name", { exact: true })
    .locator("..")
    .locator("input")
    .first()
    .fill(last);
}


import { test, expect } from "@playwright/test";

/**
 * Security-oriented smoke tests for the public /login page.
 * These are not a full penetration test; they catch obvious regressions
 * (form hygiene, error handling, absence of secret-like strings in the DOM).
 */
test.describe("/login security smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("page loads with email and password fields using safe input types", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const email = page.locator('input[type="email"]');
    const password = page.locator('input[type="password"]');
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(email).toHaveAttribute("required", "");
    await expect(password).toHaveAttribute("required", "");
  });

  test("invalid credentials show a user-facing error without leaking secret-like strings", async ({
    page,
  }) => {
    // Random password so this never matches a real account in a shared dev Supabase project.
    const password = `DefinitelyNotReal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.locator('input[type="email"]').fill("e2e-invalid-user@example.invalid");
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    const loginForm = page.locator("form").filter({ has: page.locator('input[type="email"]') });
    // Login page renders errors as the only direct <p> child of the form (see page.tsx).
    await expect(loginForm.locator("> p")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/login/);

    const bodyHtml = await page.locator("body").innerHTML();
    expect(bodyHtml).not.toMatch(/service_role|sk_live|sk_test|supabase_key|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/i);
  });

  test("script payload in email field is not written into DOM as executable HTML", async ({ page }) => {
    await page.locator('input[type="email"]').fill('<img src=x onerror="document.body.setAttribute(\'data-xss\',\'1\')">');
    await page.locator('input[type="password"]').fill("x");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    const xssAttr = await page.evaluate(() => document.body.getAttribute("data-xss"));
    expect(xssAttr).toBeNull();
  });

  test("password input value is not reflected in page URL", async ({ page }) => {
    const secret = "SecretPasswordNotInUrl123!";
    await page.locator('input[type="email"]').fill("user@example.com");
    await page.locator('input[type="password"]').fill(secret);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).not.toContain(encodeURIComponent(secret));
    expect(page.url()).not.toContain(secret);
  });
});

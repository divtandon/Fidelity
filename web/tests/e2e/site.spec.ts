import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routeHeadings = [
  ["/", /Prove the model after the transformation/i],
  ["/product", /From checkpoint to evidence/i],
  ["/methods", /The method, without the marketing/i],
  ["/docs", /Reproduce the result. Inspect the contract/i],
] as const;

function collectConsoleErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("public experience", () => {
  for (const [route, heading] of routeHeadings) {
    test(`${route} renders its primary narrative without browser errors`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.locator("#main-content")).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("documentation has no automated accessibility violations in its main content", async ({ page }) => {
    await page.goto("/docs");
    const results = await new AxeBuilder({ page }).include("#main-content").analyze();
    expect(results.violations).toEqual([]);
  });

  test("the mobile menu supports keyboard navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();
    await expect(page.locator("#mobile-menu")).toBeVisible();
    await page.locator("#mobile-menu").getByRole("link", { name: "Docs" }).click();
    await expect(page).toHaveURL(/\/docs$/);
  });

  test("reduced motion still exposes the hero content", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Prove the model/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore a validation", exact: true }).first()).toBeVisible();
  });
});

test.describe("demo validation dashboard", () => {
  test("discloses its fixture status and supports evidence inspection and export", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/runs/demo");

    await expect(page.getByText(/Demo data.*interface preview only/i)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /No statistically detectable accuracy change/i })).toBeVisible();

    await page.getByRole("button", { name: "View data table" }).click();
    await expect(page.getByRole("table", { name: /FP32 and INT8 accuracy by class/i })).toBeVisible();
    await page.getByRole("button", { name: /Inspect cat/i }).click();
    await expect(page.getByRole("dialog", { name: "Cat" })).toBeVisible();
    await page.getByRole("button", { name: "Close class details" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download demo JSON" }).first().click();
    expect((await download).suggestedFilename()).toBe("fidelity-demo-report.json");
    expect(errors).toEqual([]);
  });

  test("never substitutes demo data when the computed report is unavailable", async ({ page }) => {
    await page.goto("/runs/latest");

    await expect(page.getByRole("heading", { level: 1, name: /Computed evidence is unavailable/i })).toBeVisible();
    await expect(page.getByText(/will not substitute illustrative values/i)).toBeVisible();
    await expect(page.getByText(/DEMO-1042/i)).toHaveCount(0);
  });

  test("unknown run IDs use the scoped not-found state", async ({ page }) => {
    await page.goto("/runs/not-a-run");
    await expect(page.getByRole("heading", { level: 1, name: /That run does not exist/i })).toBeVisible();
  });
});

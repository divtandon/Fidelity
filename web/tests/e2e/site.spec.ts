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

const accessibilityRoutes = ["/", "/product", "/methods", "/docs"] as const;
const featuredRunId = "cifar10-resnet18-int8-seed2026";
const featuredRunPath = `/runs/${featuredRunId}`;

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

  for (const route of accessibilityRoutes) {
    test(`${route} has no automated accessibility violations in its main content`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).include("#main-content").analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("the mobile menu supports keyboard navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();
    await expect(page.locator("#mobile-menu")).toBeVisible();
    const docsLink = page.locator("#mobile-menu").getByRole("link", { name: "Docs" });
    await docsLink.focus();
    await expect(docsLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/docs$/);
  });

  test("the compact hero starts its live animation without scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const hero = page.locator(".hero");

    await expect(hero).toHaveAttribute("data-animation", "continuous");
    await expect(page.locator(".compression-canvas")).toBeVisible();
    await expect(page.locator(".compression-visual")).toBeInViewport({ ratio: 0.75 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect.poll(async () => Number(await hero.getAttribute("data-animation-stage")), {
      timeout: 5_000,
    }).toBeGreaterThan(0);
  });

  test("reduced motion still exposes the hero content", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Prove the model/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "View verified report", exact: true }).first()).toBeVisible();
    await expect(page.locator(".compression-canvas")).toHaveCount(0);
    await expect(page.locator(".scene-poster")).toBeVisible();
    await page.locator(".hero").dispatchEvent("pointerdown");
    await page.keyboard.press("Enter");
    await expect(page.locator(".compression-canvas")).toHaveCount(0);
    await expect(page.locator(".hero")).toHaveAttribute("data-animation-stage", "0");
    expect(errors).toEqual([]);
  });

  test("primary calls to action lead to the verified portfolio run", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".site-header .nav-cta")).toHaveAttribute("href", featuredRunPath);
    await expect(page.locator(".hero__actions .button--primary")).toHaveAttribute("href", featuredRunPath);
    await expect(page.locator(".evidence-heading .text-link")).toHaveAttribute("href", featuredRunPath);
    await expect(page.locator(".closing-card__actions .button--paper")).toHaveAttribute("href", featuredRunPath);
    await expect(page.locator(".site-footer__links").getByRole("link", { name: "Verified report" })).toHaveAttribute("href", featuredRunPath);
    await expect(page.locator(".site-footer__links").getByRole("link", { name: "Demo report" })).toHaveAttribute("href", "/runs/demo");

    await page.goto("/product");
    await expect(page.locator(".product-hero .button--primary")).toHaveAttribute("href", featuredRunPath);
    await expect(page.locator(".next-step-card .button--paper")).toHaveAttribute("href", featuredRunPath);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.locator("#mobile-menu").getByRole("link", { name: "View verified report" })).toHaveAttribute("href", featuredRunPath);
  });

  test("reduced motion reveals every animated subpage narrative", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const route of ["/product", "/methods", "/docs"]) {
      await page.goto(route);
      await expect(page.locator(".subpage-hero__copy")).toBeVisible();
      await expect(page.locator(".subpage-hero__copy")).toHaveCSS("opacity", "1");
    }

    await page.goto("/product");
    await expect(page.locator(".workflow-step").first()).toHaveCSS("opacity", "1");
    expect(errors).toEqual([]);
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
    const dialogAccessibility = await new AxeBuilder({ page }).include(".class-dialog").analyze();
    expect(dialogAccessibility.violations).toEqual([]);
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

test.describe("verified validation dashboard", () => {
  test("presents computed evidence with provenance and a correctly named export", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(featuredRunPath);

    const main = page.locator("#main-content");
    await expect(main).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: featuredRunId })).toBeVisible();
    await expect(main.getByText("92.39%", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("92.38%", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("Pipeline-produced evidence", { exact: true })).toBeVisible();
    await expect(page.locator(".demo-banner")).toHaveCount(0);
    await expect(main.getByText(/Demo data.*interface preview only/i)).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page }).include("#main-content").analyze();
    expect(accessibility.violations).toEqual([]);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download computed JSON" }).first().click();
    expect((await download).suggestedFilename()).toBe(`fidelity-${featuredRunId}.json`);
    expect(errors).toEqual([]);
  });
});

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("interactive report charts", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/runs/demo");
  });

  test("shows exact class context when a bar is hovered", async ({ page }) => {
    const classPanel = page.locator(".class-panel");
    const firstBar = classPanel.locator(".recharts-bar-rectangle").first();

    await expect(firstBar).toBeVisible();
    await firstBar.hover();

    const tooltip = classPanel.getByTestId("class-chart-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Cat");
    await expect(tooltip).toContainText("89.50%");
    await expect(tooltip).toContainText("87.90%");
    await expect(tooltip).toContainText("1.60 pp");
  });

  test("provides keyboard-equivalent class and drift inspection", async ({ page }) => {
    const classPanel = page.locator(".class-panel");
    const horse = classPanel.getByRole("button", { name: /^Horse: FP32/i });
    await horse.focus();
    await expect(horse).toBeFocused();
    await expect(classPanel.getByRole("status")).toContainText("Horse");
    await expect(classPanel.getByRole("status")).toContainText("95.60%");
    await expect(classPanel.getByRole("status")).toContainText("95.10%");

    const driftPanel = page.locator(".drift-panel");
    const reviewThreshold = driftPanel.getByRole("button", { name: /^Review threshold:/i });
    await reviewThreshold.focus();
    await expect(reviewThreshold).toBeFocused();
    await expect(driftPanel.getByRole("status")).toContainText("0.020 nats");
    await expect(driftPanel.getByRole("status")).toContainText("0.008 nats below");
  });

  test("keeps interactive chart layouts inside the desktop viewport", async ({ page }) => {
    const comparison = page.locator(".comparison-panel");
    const candidate = comparison.getByRole("button", { name: /^INT8 candidate:/i });
    await candidate.hover();
    await expect(comparison.getByRole("status")).toContainText("9,447 of 10,000 paired examples");

    for (const viewport of [{ width: 1440, height: 900 }, { width: 2048, height: 1152 }]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        chartOverflow: (() => {
          const region = document.querySelector<HTMLElement>(".class-panel [role='region']");
          if (!region) throw new Error("Missing class chart region");
          return region.scrollWidth - region.clientWidth;
        })(),
      }));

      expect(geometry.documentOverflow, `${viewport.width}px document overflow`).toBeLessThanOrEqual(0);
      expect(geometry.chartOverflow, `${viewport.width}px chart overflow`).toBeLessThanOrEqual(1);
    }
  });

  test("has no automated accessibility violations in the interactive evidence", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include(".comparison-panel")
      .include(".class-panel")
      .include(".secondary-evidence-grid")
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

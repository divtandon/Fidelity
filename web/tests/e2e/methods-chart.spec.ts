import { expect, test } from "@playwright/test";

const chartSelector = "figure[aria-labelledby='method-class-chart-title']";

test.describe("Methods class behavior chart", () => {
  test("supports pointer and keyboard readings for every verified class", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/methods#class-behavior");

    const chart = page.locator(chartSelector);
    await chart.scrollIntoViewIfNeeded();
    const rows = chart.getByRole("button");
    await expect(rows).toHaveCount(10);

    const cat = chart.getByRole("button", { name: /Cat:/i });
    await cat.hover();
    const reading = chart.getByTestId("class-behavior-reading");
    await expect(reading.getByRole("heading", { name: "Cat" })).toBeVisible();
    await expect(reading).toContainText("82.00%");
    await expect(reading).toContainText("82.90%");
    await expect(reading).toContainText("+0.90 pp");

    await cat.focus();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toBeFocused();
    await expect(reading.getByRole("heading", { name: "Dog" })).toBeVisible();
  });

  for (const viewport of [
    { width: 2048, height: 1152 },
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    test(`keeps its reading and plot separated at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/methods#class-behavior");

      const chart = page.locator(chartSelector);
      await chart.scrollIntoViewIfNeeded();
      const geometry = await chart.evaluate((element) => {
        const plot = element.querySelector<HTMLElement>("[class*='plot']");
        const reading = element.querySelector<HTMLElement>("[data-testid='class-behavior-reading']");
        if (!plot || !reading) throw new Error("Missing chart regions");
        const plotBox = plot.getBoundingClientRect();
        const readingBox = reading.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(plotBox.right, readingBox.right) - Math.max(plotBox.left, readingBox.left))
          * Math.max(0, Math.min(plotBox.bottom, readingBox.bottom) - Math.max(plotBox.top, readingBox.top));
        return {
          overlap,
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      expect(geometry.overlap).toBe(0);
      expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
    });
  }
});

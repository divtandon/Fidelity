import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routeHeadings = [
  ["/", /Prove the model after the transformation/i],
  ["/product", /From checkpoint to evidence/i],
  ["/how-it-works", /From a model change to an evidence trail/i],
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

const accessibilityRoutes = ["/", "/product", "/how-it-works", "/methods", "/docs"] as const;
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
    await expect(page.locator("#mobile-menu").getByRole("link", { name: "How it works" })).toBeVisible();
    const docsLink = page.locator("#mobile-menu").getByRole("link", { name: "Docs" });
    await docsLink.focus();
    await expect(docsLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/docs$/);
  });

  test("desktop navigation and explanatory visuals never collide", async ({ page }) => {
    const viewports = [
      { width: 2048, height: 1152 },
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 821, height: 900 },
    ];
    const routes = [
      { path: "/product", heading: ".subpage-hero h1", visual: "[aria-labelledby='pipeline-board-title']" },
      { path: "/how-it-works", heading: "#how-title", visual: "[role='img']" },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.goto(route.path);
        const geometry = await page.evaluate(({ heading, visual }) => {
          const rect = (selector: string) => {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) throw new Error(`Missing layout element: ${selector}`);
            const bounds = element.getBoundingClientRect();
            return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left };
          };
          const overlapArea = (first: ReturnType<typeof rect>, second: ReturnType<typeof rect>) => (
            Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
            * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top))
          );
          const navLink = document.querySelector<HTMLElement>(".site-nav a");
          const title = document.querySelector<HTMLElement>(heading);
          if (!navLink || !title) throw new Error("Missing desktop typography target");
          const titleStyle = getComputedStyle(title);

          return {
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            wordmarkNavOverlap: overlapArea(rect(".site-header .wordmark"), rect(".site-nav")),
            navActionOverlap: overlapArea(rect(".site-nav"), rect(".site-header__actions")),
            headingVisualOverlap: overlapArea(rect(heading), rect(visual)),
            navFontSize: Number.parseFloat(getComputedStyle(navLink).fontSize),
            titleLineHeightRatio: Number.parseFloat(titleStyle.lineHeight) / Number.parseFloat(titleStyle.fontSize),
          };
        }, route);

        const label = `${route.path} at ${viewport.width}x${viewport.height}`;
        expect(geometry.horizontalOverflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);
        expect(geometry.wordmarkNavOverlap, `${label}: wordmark/navigation overlap`).toBe(0);
        expect(geometry.navActionOverlap, `${label}: navigation/action overlap`).toBe(0);
        expect(geometry.headingVisualOverlap, `${label}: headline/visual overlap`).toBe(0);
        expect(geometry.navFontSize, `${label}: navigation text is too small`).toBeGreaterThanOrEqual(14);
        if (route.path === "/product") {
          expect(geometry.titleLineHeightRatio, `${label}: product headline lines touch`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  test("the compact hero starts its live animation without scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const hero = page.locator(".hero");
    const supportsWebGL = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
      context?.getExtension("WEBGL_lose_context")?.loseContext();
      return Boolean(context);
    });

    await expect(hero).toHaveAttribute("data-animation", "continuous");
    await expect(page.locator(".compression-visual")).toBeInViewport({ ratio: 0.75 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect.poll(async () => Number(await hero.getAttribute("data-animation-stage")), {
      timeout: 10_000,
    }).toBeGreaterThan(0);

    if (supportsWebGL) {
      await expect(page.locator(".compression-canvas")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".compression-visual")).toHaveClass(/compression-visual--live/);
    } else {
      await expect(page.locator(".compression-canvas")).toHaveCount(0);
      await expect(page.locator(".scene-poster")).toBeVisible();
    }
  });

  test("the hero layout stays separated across its responsive range", async ({ page }) => {
    const viewports = [
      { width: 2048, height: 1107 },
      { width: 1270, height: 925 },
      { width: 1024, height: 768 },
      { width: 820, height: 900 },
      { width: 390, height: 844 },
      { width: 390, height: 664 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: /Prove the model/i })).toBeVisible();

      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`Missing layout element: ${selector}`);
          const bounds = element.getBoundingClientRect();
          return {
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            left: bounds.left,
          };
        };
        const overlapArea = (
          first: ReturnType<typeof rect>,
          second: ReturnType<typeof rect>,
        ) => Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
          * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
        const hero = rect(".hero__stage");
        const rail = rect(".signal-rail");
        const proof = rect(".proof-strip");
        const heading = rect(".hero h1");
        const lead = rect(".hero__lead");
        const header = rect(".site-header__inner");
        const eyebrow = rect(".hero .eyebrow");
        const wordmark = rect(".site-header .wordmark");
        const headerControl = rect(window.innerWidth <= 820 ? ".menu-button" : ".site-nav");
        const buttons = [...document.querySelectorAll<HTMLElement>(".hero__actions .button")]
          .map((button) => {
            const bounds = button.getBoundingClientRect();
            return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left };
          });
        const metrics = [...document.querySelectorAll<HTMLElement>(".proof-strip__metric")]
          .map((metric) => {
            const bounds = metric.getBoundingClientRect();
            return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left };
          });

        return {
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          heroRailGap: rail.top - hero.bottom,
          headerCopyOverlap: overlapArea(header, eyebrow),
          headerControlOverlap: overlapArea(wordmark, headerControl),
          headingLeadOverlap: overlapArea(heading, lead),
          buttonProofOverlap: Math.max(0, ...buttons.map((button) => overlapArea(button, proof))),
          proofInsideHero: proof.left >= hero.left - 1
            && proof.right <= hero.right + 1
            && proof.top >= hero.top - 1
            && proof.bottom <= hero.bottom + 1,
          metricsInsideProof: metrics.every((metric) => metric.left >= proof.left - 1
            && metric.right <= proof.right + 1
            && metric.top >= proof.top - 1
            && metric.bottom <= proof.bottom + 1),
        };
      });

      const label = `${viewport.width}x${viewport.height}`;
      expect(geometry.horizontalOverflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);
      expect(Math.abs(geometry.heroRailGap), `${label}: hero-to-rail gap`).toBeLessThanOrEqual(1);
      expect(geometry.headerCopyOverlap, `${label}: header/copy overlap`).toBe(0);
      expect(geometry.headerControlOverlap, `${label}: header control overlap`).toBe(0);
      expect(geometry.headingLeadOverlap, `${label}: heading/lead overlap`).toBe(0);
      expect(geometry.buttonProofOverlap, `${label}: button/proof overlap`).toBe(0);
      expect(geometry.proofInsideHero, `${label}: proof escapes hero`).toBe(true);
      expect(geometry.metricsInsideProof, `${label}: metric escapes proof strip`).toBe(true);
    }
  });

  test("the hero accuracy meters disclose exact paired counts", async ({ page }) => {
    await page.goto("/");

    const referenceMeter = page.getByRole("meter", { name: "FP32 top-1 accuracy" });
    const candidateMeter = page.getByRole("meter", { name: "INT8 top-1 accuracy" });
    await expect(referenceMeter).toHaveAttribute("aria-valuenow", "92.39");
    await expect(referenceMeter).toHaveAttribute(
      "aria-valuetext",
      "92.39%; 9,239 correct out of 10,000 held-out examples",
    );
    await expect(candidateMeter).toHaveAttribute("aria-valuenow", "92.38");
    await expect(candidateMeter).toHaveAttribute(
      "aria-valuetext",
      "92.38%; 9,238 correct out of 10,000 held-out examples",
    );

    await referenceMeter.hover();
    await expect(referenceMeter.locator("[data-meter-disclosure]")).toHaveCSS("opacity", "1");
    await page.mouse.move(0, 0);
    await referenceMeter.focus();
    await expect(referenceMeter).toBeFocused();
    await expect(referenceMeter.locator("[data-meter-disclosure]")).toHaveCSS("opacity", "1");
    await page.keyboard.press("Tab");
    await expect(candidateMeter).toBeFocused();
    await expect(candidateMeter.locator("[data-meter-disclosure]")).toHaveCSS("opacity", "1");
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

    await page.goto("/how-it-works");
    await expect(page.getByRole("link", { name: "Open the real report" })).toHaveAttribute("href", featuredRunPath);

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

import { expect, test } from "@playwright/test";

const themeOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const bgOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("System follows the operating system live", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/flows");
  expect(await themeOf(page)).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => themeOf(page)).toBe("dark");
});

test("the switch in the sidebar sets Light or Dark, keeps it after a reload, and ignores the operating system", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/flows");
  expect(await themeOf(page)).toBe("dark");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("button", { name: /^Theme/ }).click();
  await page.getByRole("option", { name: "Light" }).click();
  await expect.poll(() => themeOf(page)).toBe("light");
  await page.reload();
  expect(await themeOf(page)).toBe("light");
  await nav.getByRole("button", { name: /^Theme/ }).click();
  await page.getByRole("option", { name: "Dark" }).click();
  await expect.poll(() => themeOf(page)).toBe("dark");
});

test("no flash: the theme is set before the first paint on reload", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("dfw.theme", "dark"));
  await page.emulateMedia({ colorScheme: "light" });
  // Record the theme at the first moment the DOM has a body, which is before the app code has run.
  await page.addInitScript(() => {
    const record = (): void => {
      (window as unknown as { __firstTheme?: string }).__firstTheme ??=
        document.documentElement.getAttribute("data-theme") ?? "none";
    };
    new MutationObserver((_, o) => {
      if (document.body) {
        record();
        o.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/flows");
  expect(
    await page.evaluate(
      () => (window as unknown as { __firstTheme?: string }).__firstTheme,
    ),
  ).toBe("dark");
  expect(await bgOf(page)).toBe("rgb(10, 17, 29)");
});

/**
 * Chromium always matches light or dark, even when the colour scheme is emulated as `no-preference`. A browser that says
 * neither (an old one, or one with the feature off) is built here: no `prefers-color-scheme` query matches.
 */
async function browserWithNoPreference(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => {
      const list = original(query);
      if (!/prefers-color-scheme/.test(query)) return list;
      return new Proxy(list, {
        get: (target, key) => {
          if (key === "matches") return false;
          const value = Reflect.get(target, key) as unknown;
          return typeof value === "function"
            ? (value as (...a: unknown[]) => unknown).bind(target)
            : value;
        },
      }) as MediaQueryList;
    };
  });
}

test("System with no browser preference uses dark, and a preference still wins", async ({
  page,
}) => {
  await browserWithNoPreference(page);
  await page.goto("/flows");
  expect(await themeOf(page)).toBe("dark");
});

test("System follows a browser that prefers light", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/flows");
  expect(await themeOf(page)).toBe("light");
});

const SCENE = { light: "rgb(230, 237, 247)", dark: "rgb(10, 17, 29)" };

test("the three choices show the scene and Harold colours on the Flows screen and the builder", async ({
  page,
}) => {
  await browserWithNoPreference(page);
  await page.goto("/flows");
  const nav = page.getByRole("navigation", { name: "Main" });
  const inkOf = () =>
    page.evaluate(() => getComputedStyle(document.querySelector("h1")!).color);
  const imageOf = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  const pick = async (name: string) => {
    await nav.getByRole("button", { name: /^Theme/ }).click();
    await page.getByRole("option", { name, exact: true }).click();
  };
  for (const [choice, theme, ink] of [
    ["Light", "light", "rgb(15, 26, 43)"],
    ["Dark", "dark", "rgb(244, 247, 252)"],
    ["System", "dark", "rgb(244, 247, 252)"],
  ] as const) {
    await pick(choice);
    await expect.poll(() => themeOf(page)).toBe(theme);
    expect(await bgOf(page)).toBe(SCENE[theme]);
    expect(await inkOf()).toBe(ink);
    expect(await imageOf()).toContain("gradient");
  }
  await page.goto("/flows/flow-timesheet/versions/4");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  expect(await bgOf(page)).toBe(SCENE.dark);
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".react-flow")!)
          .backgroundColor,
    ),
  ).toBe("rgba(0, 0, 0, 0)");
});

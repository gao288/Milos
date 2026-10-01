import { test, expect } from "@playwright/test";

test("compatibility WASM loads locally when the primary runtime is unavailable", async ({
  page,
}) => {
  const external = [];
  let fallbackLoaded = false;
  page.on("request", (r) => {
    if (!new URL(r.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/))
      external.push(r.url());
  });
  page.on("response", (r) => {
    if (
      r.url().includes("rive_fallback.wasm") &&
      r.request().resourceType() === "fetch" &&
      r.ok()
    )
      fallbackLoaded = true;
  });
  await page.route("**/rive.wasm*", (route) => {
    if (route.request().resourceType() === "fetch")
      return route.fulfill({ status: 404, body: "Unavailable" });
    return route.continue();
  });
  await page.goto("/?character=milo");
  await page.waitForFunction(() => window.avatar?.getState().ready);
  expect(fallbackLoaded).toBe(true);
  expect(external).toEqual([]);
  await expect(page.locator("#loading")).toBeHidden();
});

test("failed animation download shows its HTTP error and can be retried", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/milo.riv*", (route) => {
    if (fail && route.request().resourceType() === "fetch")
      return route.fulfill({ status: 503, body: "Temporary failure" });
    return route.continue();
  });
  await page.goto("/?character=milo");
  await expect(page.locator("#load-message")).toContainText("HTTP 503");
  await expect(page.locator("#retry-animation")).toBeVisible();
  expect(await page.evaluate(() => window.avatar.getState().ready)).toBe(false);
  fail = false;
  await page.locator("#retry-animation").click();
  await page.waitForFunction(() => window.avatar?.getState().ready);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#avatar canvas")).toHaveCount(1);
});

test("HTML returned for a missing animation is reported before invoking Rive", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/milo.riv*", (route) =>
    route.request().resourceType() === "fetch"
      ? route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><h1>Wrong path</h1>",
        })
      : route.continue(),
  );
  await page.goto("/?character=milo");
  await expect(page.locator("#load-message")).toContainText(
    "Invalid animation file",
  );
  expect(errors).toEqual([]);
});

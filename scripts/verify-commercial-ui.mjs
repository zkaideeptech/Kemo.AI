import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

dotenv.config({ path: ".env.local" });

const baseUrl = process.env.KEMO_UI_BASE_URL || "http://127.0.0.1:3000";
const email = `kemo-ui-${Date.now()}@test.local`;
const password = "TestPass123!";
const uploadFixturePath = join(process.cwd(), ".codex-qa-screens", "ui-upload-regression.txt");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasCjk(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function createUploadFixture() {
  mkdirSync(join(process.cwd(), ".codex-qa-screens"), { recursive: true });
  writeFileSync(
    uploadFixturePath,
    [
      "投测与风投访谈样本",
      "",
      "受访者：投测转化率、风投客户留存、IC Q&A 和微信文章都需要从同一份访谈主稿生成。",
      "研究员：请记录快速摘要、启发问题和后续追问方向。",
    ].join("\n"),
    "utf8"
  );
}

async function signUp(page) {
  await page.goto(`${baseUrl}/zh/register`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/zh\/app\/jobs/, { timeout: 20_000 });
}

async function expectNoConsoleErrors(page, label) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (text !== "Event") {
        errors.push(text);
      }
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return () => {
    assert(errors.length === 0, `${label} had console errors: ${errors.join(" | ")}`);
  };
}

async function verifyWorkspaceShell(page) {
  await page.goto(`${baseUrl}/zh/app/jobs`, { waitUntil: "networkidle" });
  await expectNoHorizontalOverflow(page, "zh workspace desktop");
  await page.getByRole("button", { name: "浅色" }).waitFor();
  await page.getByRole("button", { name: "深色" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.workspaceTheme === "dark");
  await page.getByRole("button", { name: "浅色" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.workspaceTheme === "light");
  await page.getByRole("link", { name: "English" }).click();
  await page.waitForURL(/\/en\/app\/jobs/);
  await page.locator(".kw-designer-new", { hasText: "New Project" }).waitFor({ timeout: 10_000 });
  const englishShell = await page.locator("body").innerText();
  assert(englishShell.includes("New Project"), "English workspace did not render New Project");
  assert(englishShell.includes("Theme"), "English workspace did not render theme control");
  assert(!englishShell.includes("新建项目") && !englishShell.includes("资料来源"), "English workspace shell contains Chinese navigation copy");
  await page.getByRole("link", { name: "中文" }).click();
  await page.waitForURL(/\/zh\/app\/jobs/);
  await page.locator(".kw-designer-new", { hasText: "新建项目" }).waitFor({ timeout: 10_000 });
}

async function createProjectViaMode(page, mode) {
  await page.goto(`${baseUrl}/zh/app/jobs?new=1`, { waitUntil: "networkidle" });
  await page.getByRole("dialog", { name: "创建项目" }).waitFor();
  await page.getByRole("textbox").first().fill(`UI ${mode === "live" ? "实时" : "上传"} ${Date.now()}`);
  await page.getByRole("textbox").nth(1).fill("UI 回归验证项目");
  if (mode === "upload") {
    await page.getByRole("radio", { name: /上传文件/ }).click();
    await page.getByRole("button", { name: "创建并上传文件" }).click();
    await page.getByRole("dialog", { name: "添加研究素材" }).waitFor({ timeout: 20_000 });
    await expectNoHorizontalOverflow(page, "upload path dialog");
    const bodyText = await page.locator("body").innerText();
    assert(bodyText.includes("资料来源"), "Upload path did not enter Sources view");
    assert(bodyText.includes("上传文件"), "Upload material dialog did not show upload option");
    await page.setInputFiles('input[type="file"]', uploadFixturePath);
    await page.getByRole("button", { name: /ui-upload-regression\.txt/ }).waitFor({ timeout: 20_000 });
    const listText = await page.locator("body").innerText();
    assert(listText.includes("1 个资料"), "Uploaded text source did not update the sources count");
    await page.getByRole("button", { name: /ui-upload-regression\.txt/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes("投测转化率") && document.body.innerText.includes("IC Q&A"), { timeout: 10_000 });
    return;
  }

  await page.getByRole("button", { name: "创建并开始实时访谈" }).click();
  await page.locator(".kemo-reference-live").waitFor({ timeout: 20_000 });
  await page.locator(".kemo-live-progress").waitFor({ timeout: 10_000 });
  await page.locator(".kemo-live-progress-item").nth(3).waitFor({ timeout: 10_000 });
  const bodyText = await page.locator("body").innerText();
  assert(bodyText.includes("成果"), "Live path does not show progress panel");
  assert(await page.locator(".kemo-live-inspector").isVisible(), "Live path does not show the right inspector");
  assert(bodyText.includes("暂无实时笔记"), "Live path does not show live-note empty progress");
  assert(bodyText.includes("暂无追问建议"), "Live path does not show question-coach empty progress");
}

async function verifyEnglishLiveCopy(page) {
  await page.goto(`${baseUrl}/en/app/jobs?new=1`, { waitUntil: "networkidle" });
  await page.getByRole("dialog", { name: "Create Project" }).waitFor();
  await page.getByRole("textbox").first().fill(`UI Live EN ${Date.now()}`);
  await page.getByRole("textbox").nth(1).fill("English live regression");
  await page.getByRole("button", { name: "Create and start live interview" }).click();
  await page.locator(".kemo-reference-live").waitFor({ timeout: 20_000 });
  await page.locator(".kemo-live-progress").waitFor({ timeout: 10_000 });
  const bodyText = await page.locator("body").innerText();
  assert(bodyText.includes("Live notes"), "English live page did not show Live notes");
  assert(bodyText.includes("Question coach"), "English live page did not show Question coach");
  assert(!hasCjk(bodyText), `English live page contains Chinese UI text: ${bodyText.slice(0, 800)}`);
}

async function verifySecondaryRoutes(page) {
  await page.goto(`${baseUrl}/zh/app/settings`, { waitUntil: "networkidle" });
  await expectNoHorizontalOverflow(page, "zh settings desktop");
  let bodyText = await page.locator("body").innerText();
  assert(bodyText.includes("设置") && bodyText.includes("界面主题") && bodyText.includes("个人资料"), "Chinese settings page did not render expected copy");

  await page.goto(`${baseUrl}/en/app/settings`, { waitUntil: "networkidle" });
  bodyText = await page.locator("body").innerText();
  assert(bodyText.includes("Settings") && bodyText.includes("Interface Theme") && bodyText.includes("Profile"), "English settings page did not render expected copy");
  assert(!bodyText.includes("个人中心") && !bodyText.includes("新建项目"), "English settings shell contains Chinese copy");

  await page.goto(`${baseUrl}/zh/login`, { waitUntil: "networkidle" });
  bodyText = await page.locator("body").innerText();
  assert(bodyText.includes("欢迎回来") && bodyText.includes("研究工作台"), "Chinese login page did not render expected copy");

  await page.goto(`${baseUrl}/en/register`, { waitUntil: "networkidle" });
  bodyText = await page.locator("body").innerText();
  assert(bodyText.includes("Sign up") && bodyText.includes("Research Workbench"), "English register page did not render expected copy");
  assert(!bodyText.includes("研究工作台") && !bodyText.includes("注册"), "English register page contains Chinese copy");
}

async function verifyMobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/zh/app/jobs`, { waitUntil: "networkidle" });
  await expectNoHorizontalOverflow(page, "zh workspace mobile");
  await page.goto(`${baseUrl}/zh/app/jobs?new=1`, { waitUntil: "networkidle" });
  await page.getByRole("dialog", { name: "创建项目" }).waitFor();
  await expectNoHorizontalOverflow(page, "new project modal mobile");
}

async function expectNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  const overflow = Math.max(result.scrollWidth, result.bodyScrollWidth) - result.innerWidth;
  assert(overflow <= 2, `${label} has horizontal overflow of ${overflow}px`);
}

async function main() {
  createUploadFixture();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const checkConsole = await expectNoConsoleErrors(page, "commercial UI verification");

  try {
    await signUp(page);
    await verifyWorkspaceShell(page);
    await createProjectViaMode(page, "upload");
    await createProjectViaMode(page, "live");
    await verifyEnglishLiveCopy(page);
    await verifySecondaryRoutes(page);
    await verifyMobile(page);
    checkConsole();
    console.log("PASS commercial UI: Vercel-style shell, i18n, theme, new-project modes, live progress, and responsive smoke checks passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

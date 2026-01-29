/**
 * Screenshot capturer for Shipchronicle
 * Uses Puppeteer to capture screenshots of dev servers
 */

import * as puppeteer from "puppeteer";
import * as path from "path";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { ensureStorageDir } from "../config";
import { getBestCaptureUrl } from "../utils/server-detect";

export interface CaptureOptions {
  width?: number;
  height?: number;
  fullPage?: boolean;
  waitForSelector?: string;
  waitTime?: number;
}

const DEFAULT_OPTIONS: Required<CaptureOptions> = {
  width: 1280,
  height: 800,
  fullPage: false,
  waitForSelector: "",
  waitTime: 1000,
};

export class ScreenshotCapturer {
  private projectPath: string;
  private screenshotsDir: string;
  private browser: puppeteer.Browser | null = null;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    const storageDir = ensureStorageDir(projectPath);
    this.screenshotsDir = path.join(storageDir, "screenshots");

    // Ensure screenshots directory exists
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  /**
   * Initialize browser instance (lazy initialization)
   */
  private async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
    return this.browser;
  }

  /**
   * Close browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Capture a screenshot of a URL
   */
  async captureUrl(
    url: string,
    options: CaptureOptions = {}
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewport({
        width: opts.width,
        height: opts.height,
      });

      await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // Wait for specific selector if provided
      if (opts.waitForSelector) {
        await page.waitForSelector(opts.waitForSelector, { timeout: 10000 });
      }

      // Additional wait time for dynamic content
      if (opts.waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, opts.waitTime));
      }

      // Generate unique filename
      const filename = `${Date.now()}-${uuidv4().substring(0, 8)}.png`;
      const outputPath = path.join(this.screenshotsDir, filename);

      await page.screenshot({
        path: outputPath,
        fullPage: opts.fullPage,
      });

      return outputPath;
    } finally {
      await page.close();
    }
  }

  /**
   * Capture screenshot of detected dev server
   */
  async captureDevServer(
    configPort?: number,
    options: CaptureOptions = {}
  ): Promise<string | null> {
    const url = await getBestCaptureUrl(this.projectPath, configPort);

    if (!url) {
      return null;
    }

    return this.captureUrl(url, options);
  }

  /**
   * Get screenshots directory
   */
  getScreenshotsDir(): string {
    return this.screenshotsDir;
  }

  /**
   * List all captured screenshots
   */
  listScreenshots(): string[] {
    if (!fs.existsSync(this.screenshotsDir)) {
      return [];
    }

    return fs
      .readdirSync(this.screenshotsDir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => path.join(this.screenshotsDir, f))
      .sort()
      .reverse();
  }

  /**
   * Delete old screenshots (keep last N)
   */
  cleanupScreenshots(keep: number = 100): number {
    const screenshots = this.listScreenshots();

    if (screenshots.length <= keep) {
      return 0;
    }

    const toDelete = screenshots.slice(keep);
    for (const file of toDelete) {
      fs.unlinkSync(file);
    }

    return toDelete.length;
  }
}

/**
 * Capture a single screenshot (one-shot, no browser reuse)
 */
export async function captureScreenshot(
  url: string,
  outputPath: string,
  options: CaptureOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: opts.width,
      height: opts.height,
    });

    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    if (opts.waitForSelector) {
      await page.waitForSelector(opts.waitForSelector, { timeout: 10000 });
    }

    if (opts.waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.waitTime));
    }

    await page.screenshot({
      path: outputPath,
      fullPage: opts.fullPage,
    });

    return outputPath;
  } finally {
    await browser.close();
  }
}

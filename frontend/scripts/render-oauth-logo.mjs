/**
 * Rasterize OAuth consent logo (512×512) and flush-kern "Wro"+"ket".
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "public/brand/wroket-oauth-consent.svg");
const outPath = path.join(root, "public/brand/wroket-oauth-consent.png");

const svg = fs.readFileSync(svgPath, "utf8");
const html = `<!doctype html><html><body style="margin:0;background:#0f172a">${svg}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 512, height: 512 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: "load" });

const kern = await page.evaluate(() => {
  const wro = document.getElementById("wro");
  const ket = document.getElementById("ket");
  if (!wro || !ket) return null;
  const overlap = 3; // optical tuck o|k
  const wb = wro.getBBox();
  ket.setAttribute("x", String(wb.x + wb.width - overlap));
  const kb = ket.getBBox();
  const total = kb.x + kb.width - wb.x;
  const shift = (512 - total) / 2 - wb.x;
  wro.setAttribute("x", String(wb.x + shift));
  ket.setAttribute("x", String(kb.x + shift));
  return { total, overlap };
});

await page.locator("svg").screenshot({ path: outPath, omitBackground: false });
await browser.close();
console.log("wrote", outPath, fs.statSync(outPath).size, kern);

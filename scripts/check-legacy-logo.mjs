import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = [path.join(ROOT, "backend", "src"), path.join(ROOT, "frontend", "src")];
const NEEDLE = "wroket-logo.png";
const ALLOWED_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md"]);

const matches = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!ALLOWED_EXT.has(path.extname(entry.name))) continue;
    const content = fs.readFileSync(full, "utf8");
    if (content.includes(NEEDLE)) {
      const rel = path.relative(ROOT, full).replace(/\\/g, "/");
      matches.push(rel);
    }
  }
}

for (const target of TARGETS) {
  if (fs.existsSync(target)) walk(target);
}

if (matches.length > 0) {
  console.error("Legacy logo reference found:");
  for (const m of matches) console.error(` - ${m}`);
  process.exit(1);
}

console.log("No legacy logo runtime references found.");

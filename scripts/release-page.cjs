const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const page = readFileSync(resolve(root, "index.html"), "utf8");
// The host caches scripts and styles for a month. Each edited asset needs a fresh URL.
const assets = /\b(src|href)="((?:src|styles|assets)\/[^"?#]+)"/g;
process.stdout.write(page.replace(assets, (_, attribute, path) => {
  const contents = readFileSync(resolve(root, path));
  const version = createHash("sha256").update(contents).digest("hex").slice(0, 12);
  return `${attribute}="${path}?v=${version}"`;
}));

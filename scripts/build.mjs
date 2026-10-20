// Builds one self-contained page; module order comes from src/index.html. A module tagged `data-defer="<group>"` is
// inlined here like any other, so the portable page and file:// keep working; `deferred` names each group's modules,
// which scripts/site.mjs moves out of the hosted pages into one same-origin file that loads only when needed.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeCharacters } from "./characters.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, "src", path), "utf8");
const sha256 = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

writeCharacters();
let html = read("index.html");

const cssTag = /<link rel="stylesheet" href="([^"]+)">/;
const cssMatch = html.match(cssTag);
if (!cssMatch) throw new Error("index.html: stylesheet link not found");
const css = read(cssMatch[1]).trim().replace(/\r\n/g, "\n");
html = html.replace(cssTag, `<style>\n${css}\n</style>`);

const scriptTag = /^[ \t]*<script src="([^"]+)"(?: data-defer="([a-z-]+)")?><\/script>\r?\n/gm;
const tags = [...html.matchAll(scriptTag)];
const sources = tags.map((m) => m[1]);
export const deferred = new Map();
for (const [, src, group] of tags) if (group) deferred.set(group, [...(deferred.get(group) || []), src]);
if (!sources.length) throw new Error("index.html: no script tags found");
// Escape </script inside inlined JS: a literal closing tag would end the block early. `block` is also how
// scripts/site.mjs finds a deferred module in the page.
export const block = (src) => `// ---- ${src} ----\n${read(src).trim().replace(/\r\n/g, "\n")}`.replace(/<\/script/gi, "<\\/script");
const js = sources.map(block).join("\n\n");
let first = true;
html = html.replace(scriptTag, () => {
  if (!first) return "";
  first = false;
  return `<script>\n${js}\n</script>\n`;
});

// CSP allows inline blocks only by sha256 hash; new inline code must have its hash added here.
const csp = /content="(default-src 'none'; script-src [^"]*)"/;
if (!csp.test(html)) throw new Error("index.html: CSP meta not found");
html = html.replace(csp, (_, policy) => {
  const updated = policy
    .replace(/script-src [^;]+/, `script-src ${sha256(`\n${js}\n`)}`)
    .replace(/style-src [^;]+/, `style-src ${sha256(`\n${css}\n`)}`);
  return `content="${updated}"`;
});

// Throw rather than deploy a page that silently lost a module or its styles.
if (/<script\s+src=/i.test(html)) throw new Error("index.html: a script tag was not inlined");
if (!/script-src 'sha256-/.test(html)) throw new Error("index.html: the script hash was not applied");
if (!/style-src 'sha256-/.test(html)) throw new Error("index.html: the style hash was not applied");
if (js.includes("<!--")) throw new Error("a literal <!-- in a source would open script-data-escaped state");
if (/<\/style/i.test(css)) throw new Error("style.css: a literal </style would end the inline block");

const out = join(root, "oogaboogaland.html");
writeFileSync(out, html);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
// Per-module sizes make a payload regression visible instead of one 4-digit total.
const sizes = sources.map((src) => [src, read(src).trim().length]).sort((a, b) => b[1] - a[1]);
for (const [src, bytes] of sizes.slice(0, 8)) console.log(`  ${kb(bytes).padStart(9)}  ${src}`);
console.log(`built ${out} (${kb(html.length)}, gzip ${kb(gzipSync(html).length)}, ${sources.length} scripts, js ${kb(js.length)}, css ${kb(css.length)})`);

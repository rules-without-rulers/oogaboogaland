// Hosted pages only: each group of modules tagged `data-defer` in src/index.html leaves the page's one inline script
// for a same-origin file, js/<group>-<hash>.js, named in `BL.deferredScripts` at the head of the script, where
// src/js/deferred.js finds it when the group is first needed (the Timechain Sphere's rooms, once a visitor commits to
// one). The page's script policy gains 'self' for that file, as src/index.html already allows; the portable page
// (oogaboogaland.html) keeps every module inline, so file:// and a single download still work.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const hash = (text, encoding) => createHash("sha256").update(text, "utf8").digest(encoding);
export function externalizeModules(html, out, deferred, block) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error("distribution: no inline script");
  const oldPolicy = `script-src 'sha256-${hash(script[1], "base64")}'`;
  if (html.split(oldPolicy).length !== 2) throw new Error("distribution: script hash not found");
  let body = script[1];
  const named = {};
  mkdirSync(join(out, "js"), { recursive: true });
  for (const [group, sources] of deferred) {
    const parts = sources.map((src) => {
      const text = block(src);
      if (body.split(text).length !== 2) throw new Error(`distribution: ${src} is not in the page exactly once`);
      body = body.split(text).join("");
      return text;
    });
    const bundle = `${parts.join("\n\n")}\n`, name = `${group}-${hash(bundle, "hex").slice(0, 16)}.js`;
    writeFileSync(join(out, "js", name), bundle);
    named[group] = `/js/${name}`;
  }
  const updated = `\nwindow.BL = window.BL || {};\nwindow.BL.deferredScripts = ${JSON.stringify(named)};\n${body.replace(/^\n/, "")}`;
  return html.replace(script[0], () => `<script>${updated}</script>`)
    .replace(oldPolicy, `script-src 'self' 'sha256-${hash(updated, "base64")}'`);
}

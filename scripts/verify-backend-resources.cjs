const fs = require("fs"),
  path = require("path"),
  asar = require("@electron/asar");
const p = "out/storyos-win32-x64/resources/app.asar",
  files = asar.listPackage(p).map((p) => p.replaceAll("\\", "/"));
const expected = [
  "/.vite/build/main.js",
  "/.vite/build/preload.js",
  "/assets/branding/storyos-logo.svg",
  "/assets/icons/storyos.png",
  "/assets/icons/storyos.ico",
  "/assets/icons/storyos.icns",
  "/assets/licenses/reader-notices.md",
];
for (const f of expected) {
  if (!files.includes(f)) throw Error("Missing " + f);
}
const skills = files.filter((f) => f.startsWith("/skills/") && f.endsWith("SKILL.md"));
if (!skills.length) throw Error("No packaged skills");
const main = asar.extractFile(p, path.join(".vite", "build", "main.js")).toString();
if (!main.includes("You are a text analysis agent.")) throw Error("Missing static prompts");
if (!main.includes("@page{size:A4")) throw Error("Missing PDF template");
if (!main.includes("page-break-before:always")) throw Error("Missing EPUB template");
for (const f of ["assets/icons/storyos.png", "skills"]) {
  if (!fs.existsSync(path.join(p + ".unpacked", f))) throw Error("Missing unpacked " + f);
}
console.log(
  JSON.stringify({
    resourceChecks: expected.length + 5,
    bundledSkills: skills.length,
    unpackedResources: true,
  }),
);

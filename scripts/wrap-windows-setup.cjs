const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const msiPath = process.argv[2];
if (!msiPath) {
  console.error("用法: node scripts/wrap-windows-setup.cjs <StoryOS.msi>");
  process.exit(1);
}

const csc = path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
const icon = path.join(root, "assets", "icons", "storyos.ico");
const source = path.join(root, "scripts", "StoryOSSetup.cs");
const output = path.join(path.dirname(msiPath), "StoryOS-1.0.0 Setup.exe");

const result = spawnSync(csc, [
  "/nologo",
  "/target:winexe",
  `/win32icon:${icon}`,
  `/resource:${msiPath},StoryOS.msi`,
  `/out:${output}`,
  source,
], { stdio: "inherit" });

if (result.status !== 0) {
  process.exit(result.status || 1);
}

const bytes = fs.statSync(output).size;
console.log(`已生成 ${output}（${bytes} 字节）`);

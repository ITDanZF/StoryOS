import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
const require = createRequire(import.meta.url);
const outfile = path.resolve(".tmp-visual-check/verify-reader-storage.cjs");
await build({ entryPoints: ["scripts/verify-reader-storage.ts"], outfile, bundle: true, platform: "node", format: "cjs", external: ["better-sqlite3"] });
const result = spawnSync(require("electron"), [outfile], { stdio: "inherit", windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
process.exit(result.status ?? 1);

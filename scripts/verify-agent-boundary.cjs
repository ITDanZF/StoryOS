const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { isBuiltin } = require("node:module");

const root = path.resolve(__dirname, "..");
const engineRoot = path.join(root, "src/main/agent");
const contractsRoot = path.join(root, "src/shared/engine");
const inside = (directory, file) => {
  const relative = path.relative(directory, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
function files(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : entry.name.endsWith(".ts")
          ? [path.join(directory, entry.name)]
          : [],
    );
}
const config = ts.readConfigFile(path.join(root, "tsconfig.agent.json"), ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
const failures = [];
const sources = [...files(engineRoot), ...files(contractsRoot)];
for (const file of sources) {
  const content = fs.readFileSync(file, "utf8");
  const imports = ts.preProcessFile(content, true, true).importedFiles;
  for (const item of imports) {
    const specifier = item.fileName;
    if (isBuiltin(specifier)) continue;
    if (/^(?:electron|electron-squirrel-startup)(?:\/|$)/.test(specifier)) {
      failures.push(`${path.relative(root, file)} imports platform module ${specifier}`);
      continue;
    }
    const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
    if (!resolved) {
      failures.push(`${path.relative(root, file)} cannot resolve ${specifier}`);
      continue;
    }
    if (
      resolved.isExternalLibraryImport ||
      inside(path.join(root, "node_modules"), resolved.resolvedFileName)
    )
      continue;
    if (
      !inside(engineRoot, resolved.resolvedFileName) &&
      !inside(contractsRoot, resolved.resolvedFileName)
    ) {
      failures.push(`${path.relative(root, file)} imports host code ${specifier}`);
    }
    if (inside(contractsRoot, file) && inside(engineRoot, resolved.resolvedFileName)) {
      failures.push(`${path.relative(root, file)} imports engine implementation ${specifier}`);
    }
  }
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(
  `Agent boundary verified: ${sources.length} source files; no host or Electron imports.`,
);

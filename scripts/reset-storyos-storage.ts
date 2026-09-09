import path from "node:path";
import { homedir } from "node:os";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import Database from "better-sqlite3";
import ApplicationDatabase from "../src/main/story/storage/global/ApplicationDatabase.ts";
import ProjectDatabase from "../src/main/story/storage/project/ProjectDatabase.ts";

/** Explicit operator command. Normal app startup does not import or invoke this module. */
const args = process.argv.slice(2);
const homeFlag = args.indexOf("--agent-home");
const agentHome = path.resolve(
  homeFlag >= 0
    ? args[homeFlag + 1]
    : (process.env.MINI_AGENT_HOME ?? path.join(homedir(), ".mini-agent")),
);
const apply = args.includes("--apply");
if (!existsSync(agentHome))
  throw new Error(`Agent home does not exist: ${agentHome}`);
const normalize = (value: string) =>
  process.platform === "win32" ? value.toLowerCase() : value;
function verifyRealPath(target: string): void {
  if (!existsSync(target)) return;
  if (
    lstatSync(target).isSymbolicLink() ||
    normalize(realpathSync(target)) !== normalize(path.resolve(target))
  )
    throw new Error(`Refusing redirected storage path: ${target}`);
}
verifyRealPath(agentHome);
const targets = new Set<string>();
const projectRoots = new Set<string>();
function addExact(parent: string, child: string): void {
  const resolvedParent = path.resolve(parent);
  const target = path.resolve(resolvedParent, child);
  if (path.dirname(target) !== resolvedParent)
    throw new Error(`Storage target escapes its parent: ${target}`);
  verifyRealPath(target);
  if (existsSync(target)) targets.add(target);
}
function addProject(root: string): void {
  const stateRoot = path.resolve(root, ".storyos");
  if (!existsSync(stateRoot)) return;
  verifyRealPath(stateRoot);
  if (
    !existsSync(path.join(stateRoot, "project.sqlite")) &&
    !existsSync(path.join(stateRoot, "storyos.sqlite"))
  )
    return;
  projectRoots.add(path.resolve(root));
  for (const base of ["project.sqlite", "storyos.sqlite"])
    for (const suffix of ["", "-wal", "-shm"])
      addExact(stateRoot, base + suffix);
  for (const directory of ["checkpoints", "text-index", "tmp"])
    addExact(stateRoot, directory);
}
const appPath = path.join(agentHome, "app.sqlite");
if (existsSync(appPath)) {
  const old = new Database(appPath, { readonly: true, fileMustExist: true });
  try {
    const applicationId = old.pragma("application_id", { simple: true });
    if (applicationId !== 0x53544f41)
      throw new Error(
        "Refusing to reset an unrecognized application database.",
      );
    const columns = old.pragma("table_info(projects)") as { name: string }[];
    const pathColumn = columns.some((c) => c.name === "local_path")
      ? "local_path"
      : "path";
    for (const row of old
      .prepare(`SELECT ${pathColumn} AS root FROM projects`)
      .all() as { root: string }[])
      addProject(row.root);
  } finally {
    old.close();
  }
}
const workspaceRoots = new Set([path.join(agentHome, "workSpaceRoot")]);
const configPath = path.join(agentHome, "config.json");
if (existsSync(configPath)) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (
    typeof config.AGENT_WORKSPACE === "string" &&
    config.AGENT_WORKSPACE.trim()
  )
    workspaceRoots.add(path.resolve(homedir(), config.AGENT_WORKSPACE));
}
for (const root of workspaceRoots) {
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    if (!directory || !existsSync(directory)) continue;
    verifyRealPath(directory);
    addProject(directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        ![".storyos", ".git", "node_modules"].includes(entry.name)
      )
        pending.push(path.join(directory, entry.name));
    }
  }
}
for (const name of [
  "app.sqlite",
  "app.sqlite-wal",
  "app.sqlite-shm",
  "library",
  "logs",
])
  addExact(agentHome, name);
addExact(path.join(agentHome, "archives"), "projects");
const plan = {
  schemaVersion: 100,
  agentHome,
  projectRoots: [...projectRoots],
  targets: [...targets],
  apply,
};
console.log(JSON.stringify(plan, null, 2));
if (apply) {
  // Verify all resolved absolute targets again immediately before any deletion.
  for (const target of targets) verifyRealPath(target);
  for (const target of targets)
    rmSync(target, { recursive: lstatSync(target).isDirectory(), force: true });
  mkdirSync(agentHome, { recursive: true });
  const app = new ApplicationDatabase(agentHome);
  app.close();
  for (const root of projectRoots) {
    const project = new ProjectDatabase(
      path.join(root, ".storyos", "project.sqlite"),
    );
    project.close();
  }
  writeFileSync(
    path.join(agentHome, "storage-reset-v100.json"),
    JSON.stringify({ ...plan, completedAt: new Date().toISOString() }, null, 2),
  );
  console.log(
    "StoryOS storage reset completed; configuration, skills and project source files retained.",
  );
}

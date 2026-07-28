import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProjectApplication from '../../src/main/agent/application/ProjectApplication.ts';
import ApplicationDatabase from '../../src/main/agent/storage/global/ApplicationDatabase.ts';
import SqliteProjectStore from '../../src/main/agent/storage/global/SqliteProjectStore.ts';

const temporaryRoots: string[] = [];
const databases: ApplicationDatabase[] = [];

function createHarness() {
  const root = mkdtempSync(path.join(tmpdir(), 'storyos-projects-'));
  temporaryRoots.push(root);
  const agentHome = path.join(root, '.mini-agent');
  const defaultParentPath = path.join(agentHome, 'workSpaceRoot');
  mkdirSync(defaultParentPath, { recursive: true });
  writeFileSync(path.join(agentHome, 'config.json'), JSON.stringify({ AGENT_WORKSPACE: '' }), 'utf8');
  vi.stubEnv('MINI_AGENT_HOME', agentHome);
  const database = new ApplicationDatabase(agentHome);
  databases.push(database);
  const store = new SqliteProjectStore(database.handle);
  return { app: new ProjectApplication(store), defaultParentPath, root };
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const database of databases.splice(0)) database.close();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('ProjectApplication', () => {
  it('exposes the resolved default resource directory', () => {
    const { app, defaultParentPath } = createHarness();
    expect(app.getSnapshot().creationDefaults.parentPath).toBe(path.resolve(defaultParentPath));
  });

  it('creates and activates a project under the selected resource directory', () => {
    const { app, root } = createHarness();
    const parentPath = path.join(root, 'selected-projects');
    mkdirSync(parentPath);

    const project = app.createProject({ name: 'My Story', parentPath });

    expect(project.path).toBe(path.join(parentPath, 'My-Story'));
    expect(existsSync(project.path)).toBe(true);
    expect(app.getSnapshot().activeProjectPath).toBe(project.path);
  });

  it('adds a numeric suffix when the generated directory already exists', () => {
    const { app, root } = createHarness();
    const parentPath = path.join(root, 'selected-projects');
    mkdirSync(parentPath);

    const first = app.createProject({ name: 'My Story', parentPath });
    const second = app.createProject({ name: 'My Story', parentPath });

    expect(path.basename(first.path)).toBe('My-Story');
    expect(path.basename(second.path)).toBe('My-Story-2');
  });

  it('normalizes traversal-like and Windows-reserved names safely', () => {
    const { app, root } = createHarness();
    const parentPath = path.join(root, 'selected-projects');
    mkdirSync(parentPath);

    const traversal = app.createProject({ name: '..', parentPath });
    const reserved = app.createProject({ name: 'CON.txt', parentPath });

    expect(path.basename(traversal.path)).toBe('untitled-project');
    expect(path.basename(reserved.path)).toBe('project-CON.txt');
  });

  it('renames the project directory and keeps the active project on the new path', () => {
    const { app, root } = createHarness();
    const parentPath = path.join(root, 'selected-projects');
    mkdirSync(parentPath);
    const project = app.createProject({ name: 'Original Story', parentPath });
    writeFileSync(path.join(project.path, 'story.md'), '# Story', 'utf8');

    const result = app.renameProject({ projectPath: project.path, name: 'Renamed Story' });

    expect(result.previousProject.path).toBe(project.path);
    expect(result.project.name).toBe('Renamed Story');
    expect(result.project.path).toBe(path.join(parentPath, 'Renamed-Story'));
    expect(existsSync(project.path)).toBe(false);
    expect(existsSync(path.join(result.project.path, 'story.md'))).toBe(true);
    expect(app.getSnapshot().activeProjectPath).toBe(result.project.path);
  });

  it('rejects a rename when the target directory already exists', () => {
    const { app, root } = createHarness();
    const parentPath = path.join(root, 'selected-projects');
    mkdirSync(parentPath);
    const project = app.createProject({ name: 'Original Story', parentPath });
    const occupiedPath = path.join(parentPath, 'Occupied');
    mkdirSync(occupiedPath);

    expect(() => app.renameProject({ projectPath: project.path, name: 'Occupied' }))
      .toThrow(`Project path already exists: ${occupiedPath}`);
    expect(existsSync(project.path)).toBe(true);
  });

  it('creates project-local StoryOS state and keeps a stable project id after rename', () => {
    const { app, root } = createHarness();
    const parentPath = path.join(root, 'selected-projects');
    mkdirSync(parentPath);
    const project = app.createProject({ name: 'Scoped Story', parentPath });
    const metadataPath = path.join(project.path, '.storyos', 'project.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as { projectId: string };

    const result = app.renameProject({ projectPath: project.path, name: 'Scoped Story Renamed' });
    const renamedMetadata = JSON.parse(readFileSync(path.join(result.project.path, '.storyos', 'project.json'), 'utf8')) as { projectId: string };

    expect(project.id).toBe(metadata.projectId);
    expect(result.project.id).toBe(project.id);
    expect(renamedMetadata.projectId).toBe(project.id);
  });
  it('rejects a resource directory that does not exist', () => {
    const { app, root } = createHarness();
    const missingPath = path.join(root, 'missing');
    expect(() => app.createProject({ name: 'Story', parentPath: missingPath }))
      .toThrow(`Project resource directory does not exist: ${missingPath}`);
  });
});

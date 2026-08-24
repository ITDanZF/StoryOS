const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { _electron: electron } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const executablePath = path.join(
  projectRoot,
  'out',
  'storyos-win32-x64',
  'storyos.exe',
);
const electronPath = path.join(
  projectRoot,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);
const packagedAsarPath = path.join(
  projectRoot,
  'out',
  'storyos-win32-x64',
  'resources',
  'app.asar',
);

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function verifyFinalExecutable(testHome) {
  const output = [];
  const child = spawn(executablePath, [], {
    env: { ...process.env, MINI_AGENT_HOME: testHome },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  await wait(8_000);
  if (child.exitCode !== null) {
    throw new Error(
      `Packaged executable exited during startup with code ${child.exitCode}.\n${output.join('')}`,
    );
  }

  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(5_000),
  ]);
  return { pid: child.pid, stayedAlive: true };
}

async function main() {
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Packaged executable not found: ${executablePath}`);
  }
  if (!fs.existsSync(packagedAsarPath)) {
    throw new Error(`Packaged ASAR not found: ${packagedAsarPath}`);
  }

  const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'storyos-smoke-'));
  let application;

  try {
    application = await electron.launch({
      executablePath: electronPath,
      args: [packagedAsarPath],
      env: {
        ...process.env,
        MINI_AGENT_HOME: testHome,
      },
      timeout: 30_000,
    });
    await application.firstWindow({ timeout: 30_000 });
    await wait(1_000);
    const window = application.windows().find(
      (candidate) => !candidate.url().startsWith('devtools://'),
    );
    if (!window) {
      throw new Error('Packaged renderer window was not created.');
    }
    await window.waitForLoadState('domcontentloaded');
    await window.locator('#root').waitFor({
      state: 'attached',
      timeout: 15_000,
    });

    const bodyText = await window.locator('body').innerText();
    const rendererRootCount = await window.locator('#root').count();
    if (rendererRootCount !== 1) {
      throw new Error(`Expected one renderer root, found ${rendererRootCount}.`);
    }
    if (!bodyText.trim()) {
      throw new Error('Packaged renderer mounted without visible content.');
    }

    const executable = await verifyFinalExecutable(testHome);
    console.log(JSON.stringify({
      executablePath,
      packagedAsarPath,
      title: await window.title(),
      bodyPreview: bodyText.slice(0, 200),
      rendererRootCount,
      configurationRequired: bodyText.includes('AI 模型'),
      asarProcessStarted: Boolean(application.process().pid),
      executable,
    }, null, 2));
  } finally {
    await application?.close().catch(() => undefined);
    fs.rmSync(testHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

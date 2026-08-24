const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
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

async function launchApplication(testHome) {
  const application = await electron.launch({
    executablePath: electronPath,
    args: [packagedAsarPath],
    env: { ...process.env, MINI_AGENT_HOME: testHome },
    timeout: 30_000,
  });
  await application.firstWindow({ timeout: 30_000 });
  await wait(1_000);
  const window = application.windows().find(
    (candidate) => !candidate.url().startsWith('devtools://'),
  );
  if (!window) throw new Error('StoryOS renderer window was not created.');
  await window.setViewportSize({ width: 1440, height: 900 });
  await window.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  return { application, window };
}

async function main() {
  if (!fs.existsSync(packagedAsarPath)) {
    throw new Error(`Packaged ASAR not found: ${packagedAsarPath}`);
  }

  const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'storyos-business-'));
  fs.mkdirSync(path.join(testHome, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(testHome, 'config.json'), JSON.stringify({
    MODEL_PROVIDER: 'openai',
    MODEL_NAME: 'release-test-model',
    MODEL_BASE_URL: 'https://example.invalid/v1',
    MODEL_API_KEY: 'release-test-key',
    AGENT_WORKSPACE: '',
    LOG_LEVEL: 'info',
  }, null, 2));

  let application;
  try {
    let launched = await launchApplication(testHome);
    application = launched.application;
    let window = launched.window;

    await window.getByLabel('项目操作').click();
    await window.getByText('新建空白项目', { exact: true }).click();
    await window.getByPlaceholder('例如：我的故事').fill('V1闭环测试工程');
    await window.getByRole('button', { name: '创建项目', exact: true }).click();
    await window.getByText('V1闭环测试工程', { exact: true }).waitFor();

    await window.getByText('书籍工作区', { exact: true }).click();
    await window.getByRole('heading', { name: '书籍概览', exact: true }).waitFor();
    const bookName = window.getByRole('textbox', { name: '书籍名称', exact: true });
    await bookName.fill('V1测试小说');
    await window.getByLabel('书籍简介').fill('用于验证项目、书籍、章节和正文持久化闭环。');
    await bookName.press('Control+s');
    await window.getByText('《V1测试小说》', { exact: true }).waitFor({ timeout: 15_000 });

    await window.getByLabel('新建分卷').click();
    await window.getByText('第一卷', { exact: true }).waitFor();
    await window.getByLabel('在“第一卷”下新建章节').click();
    await window.getByText('第一章', { exact: true }).waitFor();
    await window.getByText('第一章', { exact: true }).click();
    const editor = window.getByLabel('章节正文');
    await editor.waitFor({ state: 'visible', timeout: 15_000 });
    await editor.fill('雨落在旧城。\n这是 StoryOS V1 的业务闭环测试正文。');
    await wait(1_500);

    await application.close();
    application = undefined;

    launched = await launchApplication(testHome);
    application = launched.application;
    window = launched.window;
    await window.getByText('V1闭环测试工程', { exact: true }).waitFor();
    await window.getByText('书籍工作区', { exact: true }).click();
    await window.getByText('《V1测试小说》', { exact: true }).waitFor();
    await window.getByText('第一章', { exact: true }).click();
    const restoredEditor = window.getByLabel('章节正文');
    await restoredEditor.waitFor({ state: 'visible', timeout: 15_000 });
    const restoredText = await restoredEditor.innerText();
    if (!restoredText.includes('StoryOS V1 的业务闭环测试正文')) {
      throw new Error(`Chapter content was not restored: ${restoredText}`);
    }

    console.log(JSON.stringify({
      project: 'V1闭环测试工程',
      book: 'V1测试小说',
      volume: '第一卷',
      chapter: '第一章',
      chapterRestored: true,
      restoredText,
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

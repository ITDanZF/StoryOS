# Electron Forge + Vite 项目目录架构最佳实践

本文档用于说明 StoryOS 这类 **Electron Forge + Vite + React + TypeScript** 项目的推荐目录结构、入口文件设计、主进程/预加载脚本/渲染进程的职责边界，以及常见构建报错的原因。

## 1. 背景问题

在 Electron Forge + Vite 项目中，经常会遇到类似错误：

```bash
Could not resolve entry module "src/main.ts".
Could not resolve entry module "src/preload.ts".
```

或者：

```bash
Unable to find Electron app at /path/to/project
Cannot find module '/path/to/project/.vite/build/main.js'. Please verify that the package.json has a valid "main" entry
```

这类问题通常不是 Electron 本身坏了，而是 **入口文件路径** 和 **构建产物文件名** 没有对齐。

Electron 启动时会读取 `package.json` 中的 `main` 字段：

```json
{
  "main": ".vite/build/main.js"
}
```

这意味着 Electron 期望构建后存在：

```text
.vite/build/main.js
```

而 Electron Forge 的 Vite 插件会根据 `forge.config.ts` 中配置的入口文件进行构建。

如果配置是：

```ts
entry: 'src/main.ts'
```

通常会输出：

```text
.vite/build/main.js
```

如果配置成：

```ts
entry: 'src/main/index.ts'
```

则 Vite 可能会输出：

```text
.vite/build/index.js
```

这时 `package.json` 仍然指向 `.vite/build/main.js`，Electron 就会找不到入口文件。

## 2. 核心原则

推荐把 `src/main.ts` 和 `src/preload.ts` 保留为 **构建入口文件**。

但这两个文件不应该承载复杂业务逻辑，而应该保持很薄，只做一件事：

```ts
// src/main.ts
import './main';
```

```ts
// src/preload.ts
import './preload';
```

真实代码放到更清晰的目录中：

```text
src/main/
src/preload/
src/renderer/
src/shared/
```

这样既满足 Electron Forge + Vite 的构建约定，又能保持大型项目的可维护性。

## 3. 推荐目录结构

```text
StoryOS/
├─ package.json
├─ forge.config.ts
├─ vite.main.config.ts
├─ vite.preload.config.ts
├─ vite.renderer.config.ts
├─ index.html
├─ src/
│  ├─ main.ts
│  ├─ preload.ts
│  │
│  ├─ main/
│  │  ├─ index.ts
│  │  ├─ app.ts
│  │  ├─ windows/
│  │  │  ├─ mainWindow.ts
│  │  │  └─ windowManager.ts
│  │  ├─ ipc/
│  │  │  ├─ index.ts
│  │  │  ├─ system.ts
│  │  │  └─ project.ts
│  │  ├─ services/
│  │  │  ├─ fileService.ts
│  │  │  ├─ dbService.ts
│  │  │  └─ updaterService.ts
│  │  └─ utils/
│  │     ├─ paths.ts
│  │     └─ logger.ts
│  │
│  ├─ preload/
│  │  ├─ index.ts
│  │  ├─ api.ts
│  │  └─ types.ts
│  │
│  ├─ renderer/
│  │  ├─ index.tsx
│  │  ├─ App.tsx
│  │  ├─ routes/
│  │  ├─ pages/
│  │  ├─ components/
│  │  ├─ features/
│  │  ├─ stores/
│  │  ├─ hooks/
│  │  ├─ styles/
│  │  └─ lib/
│  │
│  └─ shared/
│     ├─ constants.ts
│     ├─ types/
│     └─ schemas/
│
├─ assets/
├─ resources/
└─ docs/
```

## 4. 各目录职责

### 4.1 `src/main.ts`

Electron 主进程的构建入口。

推荐只写：

```ts
import './main';
```

或者：

```ts
import './main/index';
```

不推荐把窗口创建、IPC 注册、文件系统访问、数据库初始化等逻辑全部写在这里。

### 4.2 `src/preload.ts`

Electron preload 脚本的构建入口。

推荐只写：

```ts
import './preload';
```

preload 的真实逻辑放到 `src/preload/` 下。

### 4.3 `src/main/`

主进程业务目录。

主进程拥有 Node.js 能力，可以访问：

- 文件系统
- 数据库
- 原生模块
- 系统 API
- Electron 主进程 API
- 应用生命周期
- 窗口管理
- 菜单、托盘、自动更新等能力

常见拆分方式：

```text
src/main/
├─ index.ts
├─ app.ts
├─ windows/
├─ ipc/
├─ services/
└─ utils/
```

建议职责：

| 目录 | 职责 |
| --- | --- |
| `app.ts` | 应用启动、退出、单实例锁、生命周期管理 |
| `windows/` | 创建和管理 BrowserWindow |
| `ipc/` | 注册 `ipcMain.handle` / `ipcMain.on` |
| `services/` | 文件、数据库、网络、系统能力封装 |
| `utils/` | 主进程内部工具函数 |

### 4.4 `src/preload/`

preload 是主进程和渲染进程之间的安全桥梁。

推荐通过 `contextBridge` 暴露最小 API：

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('system:ping'),
});
```

不推荐把整个 `ipcRenderer` 暴露给前端：

```ts
// 不推荐
contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer);
```

原因是这样会扩大攻击面，前端页面一旦受到 XSS 影响，攻击者可能调用任意 IPC 通道。

### 4.5 `src/renderer/`

渲染进程，也就是 React 前端。

它应该专注 UI 和交互逻辑：

- 页面
- 组件
- 路由
- 状态管理
- 样式
- 前端 hooks
- 前端工具函数

不建议在 renderer 中直接访问 Node.js、文件系统或 Electron 主进程能力。

如果前端需要读取文件、保存数据、调用系统能力，应通过：

```text
renderer -> preload API -> ipcRenderer.invoke -> ipcMain.handle -> main service
```

### 4.6 `src/shared/`

放 main、preload、renderer 都可能用到的内容。

适合放：

- TypeScript 类型
- 常量
- 纯函数
- schema 校验定义
- IPC channel 名称

不适合放：

- Node.js 专属代码
- Electron 主进程 API
- 浏览器 DOM API
- React 组件

`shared` 里的代码最好是平台无关的纯 TypeScript。

## 5. 推荐配置

### 5.1 `package.json`

保持：

```json
{
  "main": ".vite/build/main.js"
}
```

不要轻易改成 `.vite/build/index.js`。

原因是 Electron Forge 模板默认围绕 `main.js` 这个产物组织启动流程。把 package main 改成 `index.js` 虽然可能临时能跑，但容易和 preload 的 `index.js` 产物冲突，也不利于团队维护。

### 5.2 `forge.config.ts`

推荐：

```ts
new VitePlugin({
  build: [
    {
      entry: 'src/main.ts',
      config: 'vite.main.config.ts',
      target: 'main',
    },
    {
      entry: 'src/preload.ts',
      config: 'vite.preload.config.ts',
      target: 'preload',
    },
  ],
  renderer: [
    {
      name: 'main_window',
      config: 'vite.renderer.config.ts',
    },
  ],
})
```

### 5.3 主窗口 preload 路径

在主进程创建窗口时：

```ts
const mainWindow = new BrowserWindow({
  width: 800,
  height: 600,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
  },
});
```

这里的 `preload.js` 对应构建后的：

```text
.vite/build/preload.js
```

所以 preload 入口也应该稳定输出为 `preload.js`。

## 6. IPC 推荐分层

推荐调用链：

```text
React Component
  ↓
window.electronAPI
  ↓
preload contextBridge
  ↓
ipcRenderer.invoke(channel, payload)
  ↓
ipcMain.handle(channel, handler)
  ↓
main service
```

示例：

```ts
// src/shared/ipcChannels.ts
export const IPC_CHANNELS = {
  SYSTEM_PING: 'system:ping',
} as const;
```

```ts
// src/main/ipc/system.ts
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';

export function registerSystemIpc() {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PING, () => {
    return 'pong';
  });
}
```

```ts
// src/main/ipc/index.ts
import { registerSystemIpc } from './system';

export function registerIpcHandlers() {
  registerSystemIpc();
}
```

```ts
// src/preload/api.ts
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';

export const electronAPI = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_PING),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

```ts
// src/preload/index.ts
import './api';
```

前端使用：

```ts
const result = await window.electronAPI.ping();
```

## 7. TypeScript 类型声明

为了让 renderer 中的 `window.electronAPI` 有类型提示，可以增加声明文件。

例如：

```ts
// src/renderer/global.d.ts
export {};

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>;
    };
  }
}
```

项目变大后，也可以把 API 类型放在 `src/preload/types.ts` 或 `src/shared/types/` 中统一维护。

## 8. 大型项目拆分建议

当项目逐渐变复杂时，可以按功能域继续拆分。

例如 StoryOS 如果未来包含故事、角色、素材、项目管理等能力，可以这样组织 renderer：

```text
src/renderer/features/
├─ story/
│  ├─ pages/
│  ├─ components/
│  ├─ hooks/
│  └─ store.ts
├─ character/
├─ asset/
└─ project/
```

main 进程服务也可以对应拆分：

```text
src/main/services/
├─ storyService.ts
├─ characterService.ts
├─ assetService.ts
└─ projectService.ts
```

IPC 可以按领域拆分：

```text
src/main/ipc/
├─ story.ts
├─ character.ts
├─ asset.ts
└─ project.ts
```

这样团队开发时，前端、主进程服务、IPC 通信层的职责会更清楚。

## 9. 常见错误与修复

### 9.1 找不到 `src/main.ts`

错误：

```bash
Could not resolve entry module "src/main.ts".
```

原因：

`forge.config.ts` 配置了：

```ts
entry: 'src/main.ts'
```

但项目里没有这个文件。

修复：

```ts
// src/main.ts
import './main';
```

### 9.2 找不到 `src/preload.ts`

错误：

```bash
Could not resolve entry module "src/preload.ts".
```

原因：

`forge.config.ts` 配置了：

```ts
entry: 'src/preload.ts'
```

但项目里没有这个文件。

修复：

```ts
// src/preload.ts
import './preload';
```

### 9.3 找不到 `.vite/build/main.js`

错误：

```bash
Cannot find module '.vite/build/main.js'
```

原因：

`package.json` 指向：

```json
"main": ".vite/build/main.js"
```

但 Vite 实际输出的是：

```text
.vite/build/index.js
```

常见触发方式是把 main 入口配置成：

```ts
entry: 'src/main/index.ts'
```

修复方式：

1. 新增 `src/main.ts`
2. 让它导入 `src/main/index.ts`
3. `forge.config.ts` 中继续使用 `entry: 'src/main.ts'`

### 9.4 preload 路径不对

如果窗口创建中写了：

```ts
preload: path.join(__dirname, 'preload.js')
```

但构建后没有 `.vite/build/preload.js`，preload 就不会正常加载。

修复方式同上：保留 `src/preload.ts` 作为构建入口。

## 10. 迁移步骤

如果当前项目已经是：

```text
src/main/index.ts
src/preload/index.ts
```

推荐这样迁移：

### 第一步：新增 `src/main.ts`

```ts
import './main';
```

### 第二步：新增 `src/preload.ts`

```ts
import './preload';
```

### 第三步：恢复 `forge.config.ts`

```ts
entry: 'src/main.ts'
```

```ts
entry: 'src/preload.ts'
```

### 第四步：保持 `package.json`

```json
"main": ".vite/build/main.js"
```

### 第五步：重新启动

```bash
npm run start
```

如果仍有旧构建缓存影响，可以删除 `.vite` 后再启动：

```bash
rm -rf .vite
npm run start
```

## 11. 最佳实践总结

推荐：

- 使用 `src/main.ts` 作为 main 构建入口
- 使用 `src/preload.ts` 作为 preload 构建入口
- 把真实主进程代码放入 `src/main/`
- 把真实 preload 代码放入 `src/preload/`
- 把 React 前端代码放入 `src/renderer/`
- 把共享类型、常量、schema 放入 `src/shared/`
- 使用 `contextBridge` 暴露最小 API 给 renderer
- 通过 IPC 调用主进程能力
- 保持 `package.json` 的 `main` 指向 `.vite/build/main.js`

不推荐：

- 把全部主进程代码堆在 `src/main.ts`
- 把全部 preload 代码堆在 `src/preload.ts`
- 让 renderer 直接访问 Node.js 或 Electron 主进程 API
- 把 `ipcRenderer` 整体暴露给前端
- 随意把 `package.json` 的 `main` 改成 `.vite/build/index.js`
- 使用 `src/main/index.ts` 直接作为 Forge main entry，除非同时明确配置输出文件名

## 12. 一句话结论

`src/main.ts` 和 `src/preload.ts` 最适合作为稳定的构建入口；真正的大型项目架构应该通过 `src/main/`、`src/preload/`、`src/renderer/`、`src/shared/` 做职责拆分。

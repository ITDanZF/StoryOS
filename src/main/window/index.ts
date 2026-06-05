import { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

interface WindowManagerOptions {
    id?: string;
    width?: number;
    height?: number;
    route?: string; // 如 #/settings，用于 SPA 路由
    alwaysOnTop?: boolean;
    resizable?: boolean;
    frame?: boolean;
    show?: boolean;
    autoHideMenuBar?: boolean;
    minWidth?: number;
    minHeight?: number;
    webPreferences?: any;
    contextIsolation?: boolean;
    nodeIntegration?: boolean;
    spellcheck?: boolean;
    isOpenDev?: boolean;
}

export default class AppWindowManager {
    private MainId: string = 'mainApp';
    private windowsMap = new Map<string, BrowserWindow>();
    private defaultOptions: WindowManagerOptions = { id: this.MainId };
    private preloadPath: string = '';

    constructor(options?: WindowManagerOptions) {
        this.defaultOptions = {
            width: 1440,
            height: 900,
            minWidth: 1100,
            minHeight: 700,
            show: false, // ready-to-show 再显示，防白屏
            autoHideMenuBar: true, // Windows/Linux 隐藏菜单栏
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                spellcheck: true,
            },
            ...options,
        };
    }

    /**
     * 创建窗口程序
     */
    public createMainWindow() {
        const win = this.createWindow({ id: this.MainId });
        return win;
    }

    get MainWindow() {
        if (this.windowsMap.has(this.MainId)) {
            const exist = this.windowsMap.get(this.MainId)!;
            if (exist.isMinimized()) exist.restore();
            exist.focus();
            return exist;
        }
        return null;
    }

    get MainWinId() {
        return this.MainId;
    }

    public createWindow(opts: WindowManagerOptions): BrowserWindow | null {
        const { id, route, ...customOptions } = opts;

        if (!id) {
            console.error('窗口id缺失');
            return null;
        }

        if (this.windowsMap.has(id)) {
            const exist = this.windowsMap.get(id)!;
            return exist;
        }

        const win = new BrowserWindow({
            ...this.defaultOptions,
            ...customOptions,
            webPreferences: {
                ...this.defaultOptions.webPreferences,
                ...customOptions.webPreferences,
            },
        });

        win.once('ready-to-show', () => {
            win.show();
        });

        this.loadContent(win, route);

        // 关闭时保存状态并从 Map 移除
        win.on('closed', () => {
            this.windowsMap.delete(id);
        });

        this.windowsMap.set(id, win);

        // 开启调试工具
        if (this.defaultOptions.isOpenDev) {
            win.webContents.openDevTools();
        }
        return win;
    }

    private loadContent(win: BrowserWindow, route?: string) {
        const hash = route ? (route.startsWith('#') ? route : `#${route}`) : '';

        // 开发时：Vite dev server 存在，走这里（有热更新）
        if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
            const url = hash
                ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/index.html${hash}`
                : MAIN_WINDOW_VITE_DEV_SERVER_URL;
            win.loadURL(url);
            return;
        }

        // 生产时：加载本地打包后的 HTML
        const file = path.join(
            __dirname,
            `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`
        );
        hash ? win.loadURL(`file://${file}${hash}`) : win.loadFile(file);
    }
}

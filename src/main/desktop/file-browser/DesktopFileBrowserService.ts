import { app, shell } from 'electron';
import {
    existsSync,
    readdirSync,
    readFileSync,
    mkdirSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type {
    FileBrowserEntry,
    FileBrowserLocation,
    FileBrowserPage,
    FileBrowserTarget,
    ListFileBrowserDirectoryRequest,
    ResolveFileBrowserTargetRequest,
} from '../../../shared/window/contracts.ts';

const PAGE_SIZE = 200;
const MAX_QUERY_LENGTH = 200;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function requireAbsoluteDirectory(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value.trim())) {
        throw new Error('File browser directory must be an absolute path.');
    }
    const resolved = path.resolve(value.trim());
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
        throw new Error(`Directory does not exist: ${resolved}`);
    }
    return resolved;
}

function normalizeExtensions(value: unknown): Set<string> | null {
    if (value === undefined) return null;
    if (!Array.isArray(value)) throw new Error('File extensions must be an array.');
    const extensions = value.map((extension) => {
        if (typeof extension !== 'string') throw new Error('Invalid file extension.');
        const normalized = extension.trim().replace(/^\./, '').toLocaleLowerCase('en-US');
        if (!/^[a-z0-9][a-z0-9_-]*$/i.test(normalized)) {
            throw new Error(`Invalid file extension: ${extension}`);
        }
        return normalized;
    });
    return new Set(extensions);
}

function getWindowsVolumes(): string[] {
    if (process.platform !== 'win32') return [];
    const volumes: string[] = [];
    for (let code = 67; code <= 90; code += 1) {
        const root = `${String.fromCharCode(code)}:\\`;
        if (existsSync(root)) volumes.push(root);
    }
    return volumes;
}

function getUnixVolumes(): string[] {
    if (process.platform === 'win32') return [];
    const candidates = process.platform === 'darwin'
        ? ['/', '/Volumes']
        : ['/', '/mnt', '/media'];
    return candidates.filter((candidate) => existsSync(candidate));
}

function createEntry(directoryPath: string, name: string): FileBrowserEntry {
    const absolutePath = path.join(directoryPath, name);
    try {
        const stats = statSync(absolutePath);
        const directory = stats.isDirectory();
        const extension = directory
            ? null
            : path.extname(name).replace(/^\./, '').toLocaleLowerCase('en-US') || null;
        return Object.freeze({
            name,
            absolutePath,
            kind: directory ? 'directory' : 'file',
            size: directory ? null : stats.size,
            modifiedAt: stats.mtime.toISOString(),
            extension,
            accessible: true,
        });
    } catch {
        return Object.freeze({
            name,
            absolutePath,
            kind: 'symbolic-link',
            size: null,
            modifiedAt: null,
            extension: null,
            accessible: false,
        });
    }
}

export default class DesktopFileBrowserService {
    private get recentLocationsPath(): string {
        return path.join(app.getPath('userData'), 'recent-transfer-locations.json');
    }

    private readRecentLocations(): string[] {
        if (!existsSync(this.recentLocationsPath)) return [];
        try {
            const value = JSON.parse(readFileSync(this.recentLocationsPath, 'utf8')) as unknown;
            if (!Array.isArray(value)) return [];
            return value.filter((candidate): candidate is string =>
                typeof candidate === 'string' && path.isAbsolute(candidate) && existsSync(candidate));
        } catch {
            return [];
        }
    }

    getLocations(): readonly FileBrowserLocation[] {
        const candidates: FileBrowserLocation[] = [
            { id: 'home', label: '用户目录', absolutePath: app.getPath('home'), kind: 'home' },
            { id: 'desktop', label: '桌面', absolutePath: app.getPath('desktop'), kind: 'desktop' },
            { id: 'documents', label: '文档', absolutePath: app.getPath('documents'), kind: 'documents' },
            { id: 'downloads', label: '下载', absolutePath: app.getPath('downloads'), kind: 'downloads' },
            ...this.readRecentLocations().map((absolutePath, index) => ({
                id: `recent-${index}-${absolutePath}`,
                label: `最近：${path.basename(absolutePath) || absolutePath}`,
                absolutePath,
                kind: 'recent' as const,
            })),
            ...[...getWindowsVolumes(), ...getUnixVolumes()].map((absolutePath, index) => ({
                id: `volume-${index}-${absolutePath}`,
                label: process.platform === 'win32' ? absolutePath : path.basename(absolutePath) || '根目录',
                absolutePath,
                kind: 'volume' as const,
            })),
        ];
        const seen = new Set<string>();
        return Object.freeze(candidates.filter((candidate) => {
            const resolved = path.resolve(candidate.absolutePath);
            if (seen.has(resolved) || !existsSync(resolved)) return false;
            seen.add(resolved);
            return true;
        }).map((candidate) => Object.freeze({
            ...candidate,
            absolutePath: path.resolve(candidate.absolutePath),
        })));
    }

    listDirectory(request: ListFileBrowserDirectoryRequest): FileBrowserPage {
        const directoryPath = requireAbsoluteDirectory(request?.directoryPath);
        const extensions = normalizeExtensions(request?.extensions);
        const query = typeof request?.query === 'string' ? request.query.trim() : '';
        if (query.length > MAX_QUERY_LENGTH) throw new Error('File browser query is too long.');
        const sortBy = request?.sortBy ?? 'name';
        if (!['name', 'modifiedAt', 'size'].includes(sortBy)) throw new Error('Invalid file browser sort.');
        const direction = request?.sortDirection ?? 'asc';
        if (direction !== 'asc' && direction !== 'desc') throw new Error('Invalid file browser sort direction.');
        const offset = request?.cursor === undefined ? 0 : Number.parseInt(request.cursor, 10);
        if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid file browser cursor.');

        let entries: FileBrowserEntry[];
        try {
            entries = readdirSync(directoryPath, { withFileTypes: true })
                .map((entry) => createEntry(directoryPath, entry.name));
        } catch (error) {
            throw new Error(`Cannot read directory: ${directoryPath}`, { cause: error });
        }
        if (query) {
            const normalized = query.toLocaleLowerCase();
            entries = entries.filter((entry) => entry.name.toLocaleLowerCase().includes(normalized));
        }
        if (extensions) {
            entries = entries.filter((entry) =>
                entry.kind === 'directory' || (entry.extension !== null && extensions.has(entry.extension)));
        }
        entries.sort((left, right) => {
            if (left.kind === 'directory' && right.kind !== 'directory') return -1;
            if (right.kind === 'directory' && left.kind !== 'directory') return 1;
            let result: number;
            if (sortBy === 'modifiedAt') {
                result = (left.modifiedAt ?? '').localeCompare(right.modifiedAt ?? '');
            } else if (sortBy === 'size') {
                result = (left.size ?? -1) - (right.size ?? -1);
            } else {
                result = left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
            }
            return direction === 'asc' ? result : -result;
        });
        const page = entries.slice(offset, offset + PAGE_SIZE);
        return Object.freeze({
            directoryPath,
            parentPath: path.dirname(directoryPath) === directoryPath ? null : path.dirname(directoryPath),
            entries: Object.freeze(page),
            nextCursor: offset + PAGE_SIZE < entries.length ? String(offset + PAGE_SIZE) : null,
        });
    }

    resolveTarget(request: ResolveFileBrowserTargetRequest): FileBrowserTarget {
        const directoryPath = requireAbsoluteDirectory(request?.directoryPath);
        if (typeof request?.fileName !== 'string') throw new Error('Export file name is required.');
        const baseName = request.fileName.trim();
        const containsControlCharacter = Array.from(baseName)
            .some((character) => character.charCodeAt(0) < 32);
        if (!baseName || baseName === '.' || baseName === '..' || containsControlCharacter || /[<>:"/\\|?*]/.test(baseName)) {
            throw new Error('Export file name contains invalid characters.');
        }
        if (WINDOWS_RESERVED_NAME.test(baseName)) throw new Error('Export file name is reserved by Windows.');
        const extension = [...normalizeExtensions([request?.extension]) ?? []][0];
        if (!extension) throw new Error('Export extension is required.');
        const suffix = `.${extension}`;
        const fileName = baseName.toLocaleLowerCase('en-US').endsWith(suffix)
            ? baseName
            : `${baseName}${suffix}`;
        const outputPath = path.resolve(directoryPath, fileName);
        if (path.dirname(outputPath) !== directoryPath) throw new Error('Export path escapes its directory.');
        return Object.freeze({ outputPath, exists: existsSync(outputPath) });
    }

    revealFile(filePath: string): void {
        if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
            throw new Error('File path must be absolute.');
        }
        shell.showItemInFolder(path.resolve(filePath));
    }

    rememberLocation(fileOrDirectoryPath: string): void {
        if (typeof fileOrDirectoryPath !== 'string' || !path.isAbsolute(fileOrDirectoryPath)) {
            throw new Error('Recent transfer location must be an absolute path.');
        }
        const resolved = path.resolve(fileOrDirectoryPath);
        if (!existsSync(resolved)) return;
        const directoryPath = statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
        const internalLibrarySegment = `${path.sep}library${path.sep}`;
        if (`${directoryPath}${path.sep}`.includes(internalLibrarySegment)) return;
        const next = [directoryPath, ...this.readRecentLocations().filter((item) => item !== directoryPath)].slice(0, 5);
        const destination = this.recentLocationsPath;
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, JSON.stringify(next), { encoding: 'utf8', flag: 'w' });
    }
}

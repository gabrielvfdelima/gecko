import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
    CreateDirectoryAtPath,
    CreateEntry,
    CreateWorkspaceAtPath,
    DeleteEntry,
    ForceQuit,
    GetUserStandardDirectories,
    GetWorkspaceSubdirectories,
    ListSystemDirectory,
    LoadSettings,
    ReadFile,
    ReadWorkspaceTree,
    RemoveWorkspaceRoot,
    RenameEntry,
    SaveFile,
    SaveSettings,
    SetHasDirtyTabs,
} from "../wailsjs/go/main/App";
import { main } from "../wailsjs/go/models";
import {
    EventsOn,
    WindowIsMaximised,
    WindowMinimise,
    WindowToggleMaximise,
} from "../wailsjs/runtime/runtime";
import {
    createGeckoEditorState,
    createGeckoEditorView,
    CursorStatusInfo,
    extractCursorStatus,
} from "./editor/setup";
import {
    getUrlAtPos,
    openExternalUrl,
    removeLinkAtCursor,
} from "./editor/hybridMarkdown";
import {
    htmlToMarkdown,
    pastePlainTextIntoView,
} from "./editor/clipboardMarkdown";
import {
    toggleBlockquoteCommand,
    toggleBulletListCommand,
    toggleNumberedListCommand,
    toggleTaskListCommand,
} from "./editor/shortcuts";
import {
    computeSelectionStats,
    computeTextStats,
    formatWritingStats,
    TextStats,
} from "./editor/textStats";
import {
    attachTabPointerDrag,
    attachTreePointerDrag,
    TabDropPosition,
    TreeDropPosition,
} from "./dragReorder";
import {
    ActiveLayer,
    createListNavigator,
    cycleWorkbenchRegion,
    focusRegion,
    initKeyboardDispatcher,
    KeyBinding,
    ListNavigator,
    pushLayer,
    registerKeybindings,
    registerRegion,
} from "./keyboard";
import {
    applyGeckoThemeColor,
    DEFAULT_GECKO_BRAND_COLOR,
    normalizeHex,
} from "./theme/colorEngine";
import { createColorConfigModal } from "./theme/colorModal";
import { createShortcutsModal } from "./shortcuts/shortcutsModal";

type SortMode = "name" | "modTime" | "birthTime" | "manual";
type SortDirection = "asc" | "desc";

interface WorkspaceSortConfig {
    mode: SortMode;
    dir: SortDirection;
}

interface WorkspaceEntry {
    root: string;
    tree: main.FileNode | null;
    sortMode: SortMode;
    sortDir: SortDirection;
    refreshing: boolean;
}

interface GeckoSettings {
    workspaces?: string[];
    recentWorkspaces?: string[];
    lastWorkspace?: string;
    workspaceSort?: Record<string, WorkspaceSortConfig>;
    sort?: WorkspaceSortConfig;
    // manualOrder[workspaceRoot][relativeDirPath] = ['file1.md', 'folderA', ...]
    manualOrder?: Record<string, Record<string, string[]>>;
    sidebarWidth?: number;
    accentColor?: string;
    statsIncludeSpaces?: boolean;
}

// Sidebar resize limits (px)
const SIDEBAR_DEFAULT_WIDTH = 260;
const SIDEBAR_MIN_WIDTH = 170;
const SIDEBAR_MAX_WIDTH = 600;

interface OpenTab {
    path: string;
    name: string;
    savedContent: string;
    lineEnding: "LF" | "CRLF";
    isDirty: boolean;
    state: EditorState;
    scrollTop: number;
    scrollLeft: number;
    docStatsCache?: TextStats;
}

interface FlatFileItem {
    name: string;
    path: string;
    relativePath: string;
}

interface VisibleTreeNode {
    path: string;
    name: string;
    isDir: boolean;
    parentDir: string;
    wsRoot: string;
}

interface InlineTreeInputState {
    mode: "create-file" | "create-folder" | "rename";
    wsRoot: string;
    parentDir: string;
    targetPath?: string;
    initialValue: string;
    isDir: boolean;
}

const STORAGE_LAST_WORKSPACE_FALLBACK = "gecko:lastWorkspaceRoot";
const STORAGE_WORKSPACES_FALLBACK = "gecko:workspacesList";
const STORAGE_ACCENT_COLOR_FALLBACK = "gecko:accentColor";
const STORAGE_STATS_SPACES_FALLBACK = "gecko:statsIncludeSpaces";

// Application State
let appSettings: GeckoSettings = {
    workspaces: [],
    workspaceSort: {},
    sort: { mode: "name", dir: "asc" },
    manualOrder: {},
    accentColor: DEFAULT_GECKO_BRAND_COLOR,
    statsIncludeSpaces: true,
};

let workspaces: WorkspaceEntry[] = [];
const expandedDirs = new Set<string>();
let selectedTreePath = "";
let selectedTreeIsDir = false;
let visibleTreeNodes: VisibleTreeNode[] = [];

const openTabs: OpenTab[] = [];
let activeTabPath = "";
let editorView: EditorView | null = null;

let inlineTreeState: InlineTreeInputState | null = null;
let inlineTabRenamePath = "";

let quickOpenVisible = false;
let quickOpenFiltered: FlatFileItem[] = [];
let quickOpenSelectedIndex = 0;

// Track self-initiated saves to avoid redundant reload flicker on fsnotify
const recentSelfSaves = new Map<string, number>();

// DOM Elements
const workbenchEl = document.getElementById("workbench") as HTMLElement;
const sidebarEl = document.getElementById("sidebar") as HTMLElement;
const sidebarResizerEl = document.getElementById(
    "sidebar-resizer",
) as HTMLElement;
const sidebarHeaderEl = document.getElementById(
    "sidebar-header",
) as HTMLElement;
const fileTreeEl = document.getElementById("file-tree") as HTMLElement;
const tabListEl = document.getElementById("tab-list") as HTMLElement;
const titlebarDragSpacerEl = document.getElementById(
    "titlebar-drag-spacer",
) as HTMLElement;
const editorContainerEl = document.getElementById(
    "editor-container",
) as HTMLElement;
const emptyStateEl = document.getElementById("empty-state") as HTMLElement;

const statusFilepathEl = document.getElementById(
    "status-filepath",
) as HTMLElement;
const statusMessageEl = document.getElementById(
    "status-message",
) as HTMLElement;
const statusCursorsEl = document.getElementById(
    "status-cursors",
) as HTMLElement;
const statusStatsBtn = document.getElementById(
    "status-stats",
) as HTMLButtonElement;
const statusPositionEl = document.getElementById(
    "status-position",
) as HTMLElement;
const statusEncodingBtn = document.getElementById(
    "status-encoding",
) as HTMLButtonElement;

const quickOpenOverlayEl = document.getElementById(
    "quick-open-overlay",
) as HTMLElement;
const quickOpenInputEl = document.getElementById(
    "quick-open-input",
) as HTMLInputElement;
const quickOpenResultsEl = document.getElementById(
    "quick-open-results",
) as HTMLElement;

const contextMenuEl = document.getElementById("context-menu") as HTMLElement;
const modalOverlayEl = document.getElementById("modal-overlay") as HTMLElement;
const modalTitleEl = document.getElementById("modal-title") as HTMLElement;
const modalBodyEl = document.getElementById("modal-body") as HTMLElement;
const modalActionsEl = document.getElementById("modal-actions") as HTMLElement;

// Buttons
const btnGeckoBrand = document.getElementById(
    "btn-gecko-brand",
) as HTMLButtonElement;
const btnOpenFolder = document.getElementById(
    "btn-open-folder",
) as HTMLButtonElement;
const btnToggleSidebar = document.getElementById(
    "btn-toggle-sidebar",
) as HTMLButtonElement;
const emptyBtnOpenFolder = document.getElementById(
    "empty-btn-open-folder",
) as HTMLButtonElement;
const emptyBtnNewFile = document.getElementById(
    "empty-btn-new-file",
) as HTMLButtonElement;

const btnWinMinimize = document.getElementById(
    "btn-win-minimize",
) as HTMLButtonElement;
const btnWinMaximize = document.getElementById(
    "btn-win-maximize",
) as HTMLButtonElement;
const iconWinMaximize = document.getElementById(
    "icon-win-maximize",
) as unknown as SVGElement;
const btnWinClose = document.getElementById(
    "btn-win-close",
) as HTMLButtonElement;

// Path & Workspace Lookup Helpers
function getBaseName(p: string): string {
    const normalized = p.replace(/\\/g, "/").replace(/\/+$/, "");
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function getDirName(p: string): string {
    const normalized = p.replace(/\\/g, "/").replace(/\/+$/, "");
    const idx = normalized.lastIndexOf("/");
    if (idx <= 0) return "/";
    return normalized.slice(0, idx);
}

function joinPath(dir: string, name: string): string {
    const cleanDir = dir.replace(/\/+$/, "");
    const cleanName = name.replace(/^\/+/, "");
    return `${cleanDir}/${cleanName}`;
}

function ensureMdFileName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const lower = trimmed.toLowerCase();
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
        return trimmed;
    }
    return `${trimmed}.md`;
}

function findWorkspaceByRoot(wsRoot: string): WorkspaceEntry | undefined {
    return workspaces.find((ws) => ws.root === wsRoot);
}

function findWorkspaceOfPath(targetPath: string): WorkspaceEntry | undefined {
    if (!targetPath) return undefined;
    let best: WorkspaceEntry | undefined;
    for (const ws of workspaces) {
        if (targetPath === ws.root || targetPath.startsWith(ws.root + "/")) {
            if (!best || ws.root.length > best.root.length) {
                best = ws;
            }
        }
    }
    return best;
}

function isWorkspaceRoot(targetPath: string): boolean {
    return workspaces.some((ws) => ws.root === targetPath);
}

function getRelativePathInWorkspace(wsRoot: string, fullPath: string): string {
    if (!wsRoot) return fullPath;
    if (fullPath === wsRoot) return ".";
    if (fullPath.startsWith(wsRoot + "/")) {
        return fullPath.slice(wsRoot.length + 1);
    }
    return fullPath;
}

function getRelativePath(fullPath: string): string {
    const ws = findWorkspaceOfPath(fullPath);
    if (!ws) return fullPath;
    const rel = getRelativePathInWorkspace(ws.root, fullPath);
    if (workspaces.length > 1) {
        return rel === "."
            ? getBaseName(ws.root)
            : `${getBaseName(ws.root)}/${rel}`;
    }
    return rel;
}

function showStatusMessage(msg: string): void {
    statusMessageEl.textContent = msg;
}

let statusTimer: any = null;
function showTemporaryStatus(msg: string, duration = 4000): void {
    showStatusMessage(msg);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
        showStatusMessage("");
    }, duration);
}

// Settings Persistence & Legacy Migration
function getFallbackWorkspacesFromLocalStorage(): string[] {
    try {
        const rawList = localStorage.getItem(STORAGE_WORKSPACES_FALLBACK);
        if (rawList) {
            const parsed = JSON.parse(rawList);
            if (Array.isArray(parsed)) {
                return parsed.filter(
                    (s): s is string =>
                        typeof s === "string" && s.trim().length > 0,
                );
            }
        }
        const legacy = localStorage.getItem(STORAGE_LAST_WORKSPACE_FALLBACK);
        if (legacy && legacy.trim()) {
            return [legacy.trim()];
        }
    } catch {
        // Ignore storage parse error
    }
    return [];
}

async function loadAppSettings(): Promise<void> {
    try {
        const bootSettings = (window as any).__GECKO_BOOT_SETTINGS__ as
            | GeckoSettings
            | undefined;
        let parsed: GeckoSettings;
        if (bootSettings && typeof bootSettings === "object") {
            parsed = bootSettings;
        } else {
            const raw = await LoadSettings();
            parsed = JSON.parse(raw || "{}") as GeckoSettings;
        }

        let initialRoots: string[] = [];
        if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
            initialRoots = parsed.workspaces.filter(
                (r): r is string =>
                    typeof r === "string" && r.trim().length > 0,
            );
        } else if (parsed.lastWorkspace && parsed.lastWorkspace.trim()) {
            initialRoots = [parsed.lastWorkspace.trim()];
        } else {
            initialRoots = getFallbackWorkspacesFromLocalStorage();
        }

        const dedupedRoots = Array.from(new Set(initialRoots));
        const defaultSort: WorkspaceSortConfig = {
            mode: parsed.sort?.mode || "name",
            dir: parsed.sort?.dir || "asc",
        };

        const savedAccent =
            (typeof parsed.accentColor === "string" &&
                normalizeHex(parsed.accentColor)) ||
            normalizeHex(
                localStorage.getItem(STORAGE_ACCENT_COLOR_FALLBACK) || "",
            ) ||
            DEFAULT_GECKO_BRAND_COLOR;

        const savedStatsSpaces =
            typeof parsed.statsIncludeSpaces === "boolean"
                ? parsed.statsIncludeSpaces
                : localStorage.getItem(STORAGE_STATS_SPACES_FALLBACK) !== "false";

        appSettings = {
            workspaces: dedupedRoots,
            recentWorkspaces: Array.isArray(parsed.recentWorkspaces)
                ? parsed.recentWorkspaces
                : [],
            lastWorkspace: dedupedRoots[0],
            workspaceSort: parsed.workspaceSort || {},
            sort: defaultSort,
            manualOrder: parsed.manualOrder || {},
            sidebarWidth:
                typeof parsed.sidebarWidth === "number"
                    ? parsed.sidebarWidth
                    : undefined,
            accentColor: savedAccent,
            statsIncludeSpaces: savedStatsSpaces,
        };
    } catch {
        const fallbackRoots = getFallbackWorkspacesFromLocalStorage();
        let fallbackAccent = DEFAULT_GECKO_BRAND_COLOR;
        try {
            fallbackAccent =
                normalizeHex(
                    localStorage.getItem(STORAGE_ACCENT_COLOR_FALLBACK) || "",
                ) || DEFAULT_GECKO_BRAND_COLOR;
        } catch {
            // Ignore
        }
        const fallbackStatsSpaces =
            localStorage.getItem(STORAGE_STATS_SPACES_FALLBACK) !== "false";
        appSettings = {
            workspaces: fallbackRoots,
            recentWorkspaces: [],
            lastWorkspace: fallbackRoots[0],
            workspaceSort: {},
            sort: { mode: "name", dir: "asc" },
            manualOrder: {},
            accentColor: fallbackAccent,
            statsIncludeSpaces: fallbackStatsSpaces,
        };
    }
}

async function persistAppSettings(): Promise<void> {
    const roots = workspaces.map((ws) => ws.root);
    appSettings.workspaces = roots;
    appSettings.lastWorkspace = roots[0];

    if (!appSettings.workspaceSort) {
        appSettings.workspaceSort = {};
    }
    for (const ws of workspaces) {
        appSettings.workspaceSort[ws.root] = {
            mode: ws.sortMode,
            dir: ws.sortDir,
        };
    }

    try {
        localStorage.setItem(
            STORAGE_WORKSPACES_FALLBACK,
            JSON.stringify(roots),
        );
        if (roots[0]) {
            localStorage.setItem(STORAGE_LAST_WORKSPACE_FALLBACK, roots[0]);
        } else {
            localStorage.removeItem(STORAGE_LAST_WORKSPACE_FALLBACK);
        }
        if (appSettings.accentColor) {
            localStorage.setItem(
                STORAGE_ACCENT_COLOR_FALLBACK,
                appSettings.accentColor,
            );
        }
        localStorage.setItem(
            STORAGE_STATS_SPACES_FALLBACK,
            String(appSettings.statsIncludeSpaces ?? true),
        );
    } catch {
        // Ignore storage write errors
    }

    try {
        await SaveSettings(JSON.stringify(appSettings, null, 2));
    } catch {
        // Ignore if running outside Wails runtime
    }
}

function syncDirtyStateWithBackend(): void {
    const hasDirty = openTabs.some(
        (t) =>
            t.isDirty &&
            !(t.path.startsWith("untitled:") && t.state.doc.length === 0),
    );
    try {
        void SetHasDirtyTabs(hasDirty);
    } catch {
        // Ignore if running outside Wails runtime
    }
}

// Editor State Creation for a Tab
function buildEditorStateForTab(
    tabPath: string,
    initialContent: string,
): EditorState {
    return createGeckoEditorState(initialContent, {
        onDocChanged: (newContent) => {
            const tab = openTabs.find((t) => t.path === tabPath);
            if (!tab) return;
            if (editorView && activeTabPath === tab.path) {
                tab.state = editorView.state;
            }
            tab.docStatsCache = computeTextStats(newContent);
            if (activeTabPath === tab.path) {
                updateWritingStats(editorView?.state);
            }
            const nextDirty = tab.path.startsWith("untitled:")
                ? true
                : newContent !== tab.savedContent;
            if (tab.isDirty !== nextDirty) {
                tab.isDirty = nextDirty;
                renderTabs();
                syncDirtyStateWithBackend();
            }
            showStatusMessage("");
        },
        onStatusChanged: (status) => {
            if (activeTabPath === tabPath) {
                updateStatusBarCursorInfo(status);
            }
        },
        onStatusMessage: (msg) => {
            showTemporaryStatus(msg);
        },
    });
}

function ensureEditorView(initialState: EditorState): EditorView {
    if (!editorView) {
        editorView = createGeckoEditorView(editorContainerEl, initialState);
    } else {
        editorView.setState(initialState);
    }
    return editorView;
}

// Status Bar Updates & Writing Statistics
function updateWritingStats(state?: EditorState): void {
    const activeTab = openTabs.find((t) => t.path === activeTabPath);
    if (!activeTab) {
        statusStatsBtn.classList.add("hidden");
        return;
    }

    statusStatsBtn.classList.remove("hidden");

    const currentState =
        state ||
        (editorView && activeTabPath === activeTab.path
            ? editorView.state
            : activeTab.state);

    if (!activeTab.docStatsCache) {
        activeTab.docStatsCache = computeTextStats(currentState.doc.toString());
    }

    let selStats: TextStats | null = null;
    let hasSelection = false;
    for (const r of currentState.selection.ranges) {
        if (!r.empty) {
            hasSelection = true;
            break;
        }
    }

    if (hasSelection) {
        const slices: string[] = [];
        for (const r of currentState.selection.ranges) {
            if (!r.empty) {
                slices.push(currentState.sliceDoc(r.from, r.to));
            }
        }
        selStats = computeSelectionStats(slices);
    }

    const includeSpaces = appSettings.statsIncludeSpaces ?? true;
    const formatted = formatWritingStats(
        activeTab.docStatsCache,
        selStats,
        includeSpaces,
    );

    statusStatsBtn.textContent = formatted.label;
    statusStatsBtn.title = formatted.tooltip;
}

function toggleWritingStatsMode(): void {
    appSettings.statsIncludeSpaces = !(appSettings.statsIncludeSpaces ?? true);
    void persistAppSettings();
    updateWritingStats();
}

function updateStatusBarCursorInfo(info: CursorStatusInfo): void {
    const cursorLabel =
        info.cursorCount === 1 ? "1 cursor" : `${info.cursorCount} cursores`;
    statusCursorsEl.textContent = cursorLabel;
    statusPositionEl.textContent = `Ln ${info.line}, Col ${info.col}`;
    updateWritingStats();
}

function updateStatusBar(): void {
    const activeTab = openTabs.find((t) => t.path === activeTabPath);
    if (!activeTab) {
        const selectedWs =
            findWorkspaceOfPath(selectedTreePath) || workspaces[0];
        statusFilepathEl.textContent = selectedWs
            ? `${getBaseName(selectedWs.root)} — Sem arquivo aberto`
            : "Sem arquivo aberto";
        statusCursorsEl.textContent = "1 cursor";
        statusPositionEl.textContent = "Ln 1, Col 1";
        statusEncodingBtn.textContent = "LF";
        statusStatsBtn.classList.add("hidden");
        return;
    }

    const owningWs = findWorkspaceOfPath(activeTab.path);
    if (owningWs) {
        const rel = getRelativePathInWorkspace(owningWs.root, activeTab.path);
        statusFilepathEl.textContent = `${getBaseName(owningWs.root)} / ${rel}`;
    } else {
        statusFilepathEl.textContent = activeTab.path;
    }
    statusEncodingBtn.textContent = activeTab.lineEnding;

    const state =
        editorView && activeTabPath === activeTab.path
            ? editorView.state
            : activeTab.state;
    updateStatusBarCursorInfo(extractCursorStatus(state));
    updateWritingStats(state);
}

// Multi-Workspace Operations
function resolveWorkspaceInitialSort(wsRoot: string): WorkspaceSortConfig {
    const saved = appSettings.workspaceSort?.[wsRoot] || appSettings.sort;
    return {
        mode: saved?.mode || "name",
        dir: saved?.dir || "asc",
    };
}

async function handleSelectWorkspaceFolder(): Promise<string | null> {
    return await openIntegratedOpenWorkspaceModal();
}

async function handleCreateFolder(): Promise<string | null> {
    return await openIntegratedCreateWorkspaceModal();
}

async function addWorkspace(rootPath: string): Promise<string | null> {
    try {
        const tree = await ReadWorkspaceTree(rootPath);
        const cleanRoot = tree.path;
        const existing = findWorkspaceByRoot(cleanRoot);

        if (existing) {
            existing.tree = tree;
            expandedDirs.add(cleanRoot);
            selectedTreePath = cleanRoot;
            selectedTreeIsDir = true;
            renderFileTree();
            updateStatusBar();
            showStatusMessage(`Workspace já aberto: ${tree.name}`);
            return cleanRoot;
        }

        const sortCfg = resolveWorkspaceInitialSort(cleanRoot);
        workspaces.push({
            root: cleanRoot,
            tree,
            sortMode: sortCfg.mode,
            sortDir: sortCfg.dir,
            refreshing: false,
        });

        expandedDirs.add(cleanRoot);
        selectedTreePath = cleanRoot;
        selectedTreeIsDir = true;

        appSettings.recentWorkspaces = Array.from(
            new Set([cleanRoot, ...(appSettings.recentWorkspaces || [])]),
        ).slice(0, 10);

        await persistAppSettings();
        renderFileTree();
        updateStatusBar();
        showStatusMessage(`Workspace aberto: ${tree.name}`);
        return cleanRoot;
    } catch (err) {
        showStatusMessage(
            `Não foi possível carregar o workspace: ${String(err)}`,
        );
        return null;
    }
}

async function loadInitialWorkspaces(roots: string[]): Promise<void> {
    if (roots.length === 0) return;

    const results = await Promise.allSettled(
        roots.map((r) => ReadWorkspaceTree(r)),
    );

    const loaded: WorkspaceEntry[] = [];
    for (const res of results) {
        if (res.status === "fulfilled" && res.value) {
            const tree = res.value;
            if (!loaded.some((w) => w.root === tree.path)) {
                const sortCfg = resolveWorkspaceInitialSort(tree.path);
                loaded.push({
                    root: tree.path,
                    tree,
                    sortMode: sortCfg.mode,
                    sortDir: sortCfg.dir,
                    refreshing: false,
                });
                expandedDirs.add(tree.path);
            }
        }
    }

    workspaces = loaded;
    if (workspaces.length > 0 && !selectedTreePath) {
        selectedTreePath = workspaces[0].root;
        selectedTreeIsDir = true;
    }

    await persistAppSettings();
    renderFileTree();
    updateStatusBar();
}

function countTreeNodes(node: main.FileNode | null): number {
    if (!node || !node.children) return 0;
    let total = 0;
    for (const child of node.children) {
        total += 1;
        if (child.isDir) {
            total += countTreeNodes(child);
        }
    }
    return total;
}

async function refreshWorkspaceTree(
    targetRoot?: string,
    isManual = false,
): Promise<void> {
    if (workspaces.length === 0) return;

    if (targetRoot) {
        const ws = findWorkspaceByRoot(targetRoot);
        if (!ws) return;

        if (isManual) {
            ws.refreshing = true;
            renderWorkspaceSectionInPlace(ws.root);
        }

        try {
            const tree = await ReadWorkspaceTree(ws.root);
            ws.tree = tree;
            ws.refreshing = false;
            renderWorkspaceSectionInPlace(ws.root);

            if (isManual) {
                const count = countTreeNodes(tree);
                const now = new Date();
                const hh = String(now.getHours()).padStart(2, "0");
                const mm = String(now.getMinutes()).padStart(2, "0");
                const ss = String(now.getSeconds()).padStart(2, "0");
                const itemLabel = count === 1 ? "1 item" : `${count} itens`;
                showStatusMessage(
                    `${tree.name} atualizado ${hh}:${mm}:${ss} · ${itemLabel}`,
                );

                const sectionEl = getWorkspaceSectionEl(ws.root);
                if (sectionEl) {
                    sectionEl.classList.remove("tree-flash");
                    void sectionEl.offsetWidth;
                    sectionEl.classList.add("tree-flash");
                }
            }
        } catch (err) {
            ws.refreshing = false;
            renderWorkspaceSectionInPlace(ws.root);
            showStatusMessage(
                `Erro ao atualizar ${getBaseName(ws.root)}: ${String(err)}`,
            );
        }
        return;
    }

    // Refresh all open workspaces in parallel
    await Promise.allSettled(
        workspaces.map(async (ws) => {
            const tree = await ReadWorkspaceTree(ws.root);
            ws.tree = tree;
        }),
    );
    renderFileTree();
}

// Sorting & Manual Order Management (Per-Workspace)
function getManualOrderList(wsRoot: string, parentDirPath: string): string[] {
    if (!wsRoot) return [];
    const relDir = getRelativePathInWorkspace(wsRoot, parentDirPath);
    const wsMap = appSettings.manualOrder?.[wsRoot];
    return wsMap?.[relDir] ? [...wsMap[relDir]] : [];
}

function setManualOrderList(
    wsRoot: string,
    parentDirPath: string,
    names: string[],
): void {
    if (!wsRoot) return;
    const relDir = getRelativePathInWorkspace(wsRoot, parentDirPath);
    if (!appSettings.manualOrder) {
        appSettings.manualOrder = {};
    }
    if (!appSettings.manualOrder[wsRoot]) {
        appSettings.manualOrder[wsRoot] = {};
    }
    appSettings.manualOrder[wsRoot][relDir] = names;
}

function compareByName(a: main.FileNode, b: main.FileNode): number {
    const lowerA = a.name.toLowerCase();
    const lowerB = b.name.toLowerCase();
    if (lowerA !== lowerB) {
        return lowerA < lowerB ? -1 : 1;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function getSortedChildren(
    ws: WorkspaceEntry,
    parentPath: string,
    children: main.FileNode[],
): main.FileNode[] {
    const copy = [...children];

    if (ws.sortMode === "manual") {
        const manualList = getManualOrderList(ws.root, parentPath);
        if (manualList.length === 0) {
            return copy.sort((a, b) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                return compareByName(a, b);
            });
        }
        const indexMap = new Map<string, number>();
        manualList.forEach((name, idx) => indexMap.set(name, idx));

        return copy.sort((a, b) => {
            const idxA = indexMap.has(a.name)
                ? indexMap.get(a.name)!
                : Number.MAX_SAFE_INTEGER;
            const idxB = indexMap.has(b.name)
                ? indexMap.get(b.name)!
                : Number.MAX_SAFE_INTEGER;
            if (idxA !== idxB) {
                return idxA - idxB;
            }
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return compareByName(a, b);
        });
    }

    const multiplier = ws.sortDir === "asc" ? 1 : -1;

    return copy.sort((a, b) => {
        // Folders always first in automatic sort modes
        if (a.isDir !== b.isDir) {
            return a.isDir ? -1 : 1;
        }

        if (ws.sortMode === "modTime") {
            const diff = (a.modTime || 0) - (b.modTime || 0);
            if (diff !== 0) return diff * multiplier;
        } else if (ws.sortMode === "birthTime") {
            const diff = (a.birthTime || 0) - (b.birthTime || 0);
            if (diff !== 0) return diff * multiplier;
        }

        return compareByName(a, b) * multiplier;
    });
}

function findNodeByPath(
    root: main.FileNode | null,
    targetPath: string,
): main.FileNode | null {
    if (!root) return null;
    if (root.path === targetPath) return root;
    if (!root.children) return null;
    for (const child of root.children) {
        const found = findNodeByPath(child, targetPath);
        if (found) return found;
    }
    return null;
}

// File Tree Rendering (Multi-Workspace with Targeted Section Updates)
function getWorkspaceSectionEl(wsRoot: string): HTMLElement | null {
    const sections = fileTreeEl.querySelectorAll<HTMLElement>(
        ".tree-workspace-section",
    );
    for (const sec of sections) {
        if (sec.dataset.root === wsRoot) {
            return sec;
        }
    }
    return null;
}

function clearTreeSelection(): void {
    if (inlineTreeState) return;
    if (!selectedTreePath && !selectedTreeIsDir) {
        const selectedEls = fileTreeEl.querySelectorAll(".tree-row.selected");
        if (selectedEls.length === 0) return;
        selectedEls.forEach((el) => el.classList.remove("selected"));
        return;
    }
    selectedTreePath = "";
    selectedTreeIsDir = false;
    fileTreeEl.querySelectorAll(".tree-row.selected").forEach((el) => {
        el.classList.remove("selected");
    });
    updateStatusBar();
}

function syncActiveFileTreeSelection(): void {
    if (inlineTreeState) return;
    if (!activeTabPath) return;
    if (selectedTreePath === activeTabPath && !selectedTreeIsDir) return;
    selectedTreePath = activeTabPath;
    selectedTreeIsDir = false;
    fileTreeEl.querySelectorAll(".tree-row.selected").forEach((el) => {
        el.classList.remove("selected");
    });
    const activeRow = fileTreeEl.querySelector<HTMLElement>(
        `.tree-row[data-path="${CSS.escape(activeTabPath)}"]`,
    );
    if (activeRow) {
        activeRow.classList.add("selected");
    } else {
        renderFileTree();
    }
    updateStatusBar();
}

function rebuildVisibleTreeNodes(): void {
    visibleTreeNodes = [];
    for (const ws of workspaces) {
        if (!ws.tree) continue;
        visibleTreeNodes.push({
            path: ws.root,
            name: ws.tree.name,
            isDir: true,
            parentDir: ws.root,
            wsRoot: ws.root,
        });
        if (expandedDirs.has(ws.root)) {
            collectVisibleChildrenNodes(ws, ws.tree.children || [], ws.root);
        }
    }
}

function collectVisibleChildrenNodes(
    ws: WorkspaceEntry,
    nodes: main.FileNode[],
    parentPath: string,
): void {
    const sortedNodes = getSortedChildren(ws, parentPath, nodes);
    for (const node of sortedNodes) {
        visibleTreeNodes.push({
            path: node.path,
            name: node.name,
            isDir: node.isDir,
            parentDir: parentPath,
            wsRoot: ws.root,
        });
        if (node.isDir && expandedDirs.has(node.path)) {
            collectVisibleChildrenNodes(ws, node.children || [], node.path);
        }
    }
}

function createWorkspaceActionButton(
    action: "new-file" | "new-folder" | "sort" | "refresh",
    wsRoot: string,
    title: string,
    svgMarkup: string,
    isBusy = false,
    targetDir?: string,
): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1;
    btn.className = `ws-action-btn${isBusy ? " is-busy" : ""}`;
    btn.dataset.action = action;
    btn.dataset.root = wsRoot;
    btn.dataset.targetDir = targetDir || wsRoot;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    if (isBusy) {
        btn.disabled = true;
    }
    btn.innerHTML = svgMarkup;
    return btn;
}

function buildWorkspaceSectionElement(ws: WorkspaceEntry): HTMLElement {
    const section = document.createElement("div");
    section.className = "tree-workspace-section";
    section.dataset.root = ws.root;

    const wsName = ws.tree?.name || getBaseName(ws.root);
    const isWsExpanded = expandedDirs.has(ws.root);
    const isWsSelected = selectedTreePath === ws.root;

    const wsHeader = document.createElement("div");
    wsHeader.className = `tree-row tree-workspace-header is-dir${
        isWsSelected ? " selected" : ""
    }`;
    wsHeader.style.paddingLeft = "8px";
    wsHeader.setAttribute("role", "treeitem");
    wsHeader.setAttribute("aria-expanded", String(isWsExpanded));
    wsHeader.setAttribute("aria-selected", String(isWsSelected));
    wsHeader.dataset.path = ws.root;
    wsHeader.dataset.wsroot = ws.root;
    wsHeader.dataset.isdir = "true";
    wsHeader.dataset.parent = ws.root;
    wsHeader.title = ws.root;

    const chevron = document.createElement("span");
    chevron.className = "tree-chevron";
    chevron.textContent = isWsExpanded ? "▾" : "▸";
    wsHeader.appendChild(chevron);

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z"/></svg>';
    wsHeader.appendChild(icon);

    const label = document.createElement("span");
    label.className = "tree-workspace-name";
    label.textContent = wsName;
    wsHeader.appendChild(label);

    // Hover-only workspace action buttons (VS Code style)
    const actionsGroup = document.createElement("div");
    actionsGroup.className = `ws-actions${ws.refreshing ? " is-busy-group" : ""}`;

    actionsGroup.appendChild(
        createWorkspaceActionButton(
            "new-file",
            ws.root,
            `Novo Arquivo .md em ${wsName}`,
            '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 1.5h6.5L13 5v9.5H3z"/><path d="M9.5 1.5V5H13"/><path d="M8 7.5v4M6 9.5h4"/></svg>',
        ),
    );
    actionsGroup.appendChild(
        createWorkspaceActionButton(
            "new-folder",
            ws.root,
            `Nova Pasta em ${wsName}`,
            '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z"/><path d="M8 7v4M6 9h4"/></svg>',
        ),
    );
    actionsGroup.appendChild(
        createWorkspaceActionButton(
            "sort",
            ws.root,
            `Ordenar ${wsName}`,
            '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h10M3 8h7M3 12h4"/><path d="M12.5 8v5.5M10.5 11.5l2 2 2-2"/></svg>',
        ),
    );
    actionsGroup.appendChild(
        createWorkspaceActionButton(
            "refresh",
            ws.root,
            `Atualizar ${wsName}`,
            '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M13.5 8a5.5 5.5 0 1 1-1.3-3.5"/><path d="M13.5 2v3h-3"/></svg>',
            ws.refreshing,
        ),
    );

    wsHeader.appendChild(actionsGroup);

    wsHeader.addEventListener("click", (e) => {
        const target = e.target as HTMLElement | null;
        if (target && target.closest(".ws-actions")) {
            return;
        }
        e.stopPropagation();
        closeContextMenu();
        selectedTreePath = ws.root;
        selectedTreeIsDir = true;
        fileTreeEl.focus();

        if (expandedDirs.has(ws.root)) {
            expandedDirs.delete(ws.root);
        } else {
            expandedDirs.add(ws.root);
        }
        renderFileTree();
        updateStatusBar();
    });

    wsHeader.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedTreePath = ws.root;
        selectedTreeIsDir = true;
        fileTreeEl.focus();
        renderFileTree();
        updateStatusBar();
        showContextMenu(e.clientX, e.clientY, [
            {
                label: "Novo Arquivo .md",
                action: () => void startCreateEntry(false, ws.root),
            },
            {
                label: "Nova Pasta",
                action: () => void startCreateEntry(true, ws.root),
            },
            { separator: true },
            {
                label: "Ordenar Arquivos...",
                action: () => openSortMenu(ws.root, wsHeader),
            },
            {
                label: "Atualizar Workspace",
                action: () => void refreshWorkspaceTree(ws.root, true),
            },
            { separator: true },
            {
                label: "Remover Workspace",
                danger: true,
                action: () => requestRemoveWorkspace(ws.root),
            },
        ]);
    });

    section.appendChild(wsHeader);

    if (isWsExpanded && ws.tree) {
        renderTreeChildren(ws, ws.tree.children || [], 1, ws.root, section);

        const hasInlineInRoot =
            inlineTreeState &&
            inlineTreeState.wsRoot === ws.root &&
            inlineTreeState.parentDir === ws.root;

        if (
            (!ws.tree.children || ws.tree.children.length === 0) &&
            !hasInlineInRoot
        ) {
            const emptyFolderMsg = document.createElement("div");
            emptyFolderMsg.className = "tree-empty";
            emptyFolderMsg.style.paddingLeft = "24px";
            emptyFolderMsg.textContent =
                "Nenhum arquivo .md neste workspace. Passe o mouse no título acima para criar.";
            section.appendChild(emptyFolderMsg);
        }
    }

    return section;
}

function scrollSelectedTreeRowIntoView(): void {
    const selectedEl =
        fileTreeEl.querySelector<HTMLElement>(".tree-row.selected");
    if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
    }
}

/**
 * Atualiza a linha selecionada na árvore de forma incremental (< 0.5ms),
 * sem destruir nem recriar o DOM da árvore a cada tecla de seta.
 */
function selectTreeNodeIncrementally(node: VisibleTreeNode): void {
    selectedTreePath = node.path;
    selectedTreeIsDir = node.isDir;

    fileTreeEl
        .querySelectorAll<HTMLElement>(".tree-row.selected")
        .forEach((el) => {
            el.classList.remove("selected");
            el.setAttribute("aria-selected", "false");
        });

    const targetRow = fileTreeEl.querySelector<HTMLElement>(
        `.tree-row[data-path="${CSS.escape(node.path)}"]`,
    );
    if (targetRow) {
        targetRow.classList.add("selected");
        targetRow.setAttribute("aria-selected", "true");
        targetRow.scrollIntoView({ block: "nearest" });
    } else {
        renderFileTree();
        scrollSelectedTreeRowIntoView();
    }
    updateStatusBar();
}

function renderWorkspaceSectionInPlace(wsRoot: string): void {
    const ws = findWorkspaceByRoot(wsRoot);
    if (!ws) {
        renderFileTree();
        return;
    }
    const existingEl = getWorkspaceSectionEl(wsRoot);
    if (!existingEl) {
        renderFileTree();
        return;
    }
    const hadTreeFocus =
        document.activeElement === fileTreeEl ||
        fileTreeEl.contains(document.activeElement);
    const replacementEl = buildWorkspaceSectionElement(ws);
    existingEl.replaceWith(replacementEl);
    rebuildVisibleTreeNodes();
    if (hadTreeFocus && !inlineTreeState) {
        fileTreeEl.focus({ preventScroll: true });
    }
}

function renderFileTree(): void {
    const hadTreeFocus =
        document.activeElement === fileTreeEl ||
        fileTreeEl.contains(document.activeElement);
    fileTreeEl.innerHTML = "";

    if (workspaces.length === 0) {
        visibleTreeNodes = [];
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "tree-empty";
        emptyDiv.textContent =
            "Nenhum workspace aberto. Clique no ícone de pasta acima ou pressione Ctrl+Alt+N.";
        fileTreeEl.appendChild(emptyDiv);
        if (hadTreeFocus && !inlineTreeState) {
            fileTreeEl.focus({ preventScroll: true });
        }
        return;
    }

    const frag = document.createDocumentFragment();
    for (const ws of workspaces) {
        if (!ws.tree) continue;
        frag.appendChild(buildWorkspaceSectionElement(ws));
    }
    fileTreeEl.appendChild(frag);
    rebuildVisibleTreeNodes();
    if (hadTreeFocus && !inlineTreeState) {
        fileTreeEl.focus({ preventScroll: true });
    }
}

function renderTreeChildren(
    ws: WorkspaceEntry,
    nodes: main.FileNode[],
    depth: number,
    parentPath: string,
    container: DocumentFragment | HTMLElement,
): void {
    if (
        inlineTreeState &&
        inlineTreeState.wsRoot === ws.root &&
        (inlineTreeState.mode === "create-file" ||
            inlineTreeState.mode === "create-folder") &&
        inlineTreeState.parentDir === parentPath
    ) {
        container.appendChild(createInlineTreeRow(depth, inlineTreeState));
    }

    const sortedNodes = getSortedChildren(ws, parentPath, nodes);

    for (const node of sortedNodes) {
        const isExpanded = expandedDirs.has(node.path);
        const isRenamingThis =
            inlineTreeState &&
            inlineTreeState.mode === "rename" &&
            inlineTreeState.targetPath === node.path;

        if (isRenamingThis && inlineTreeState) {
            container.appendChild(createInlineTreeRow(depth, inlineTreeState));
        } else {
            const isSelected = node.path === selectedTreePath;
            const row = document.createElement("div");
            row.className = `tree-row ${node.isDir ? "is-dir" : "is-file"}${
                isSelected ? " selected" : ""
            }`;
            row.style.paddingLeft = `${8 + depth * 14}px`;
            row.setAttribute("role", "treeitem");
            if (node.isDir) {
                row.setAttribute("aria-expanded", String(isExpanded));
            }
            row.setAttribute("aria-selected", String(isSelected));
            row.dataset.path = node.path;
            row.dataset.wsroot = ws.root;
            row.dataset.isdir = String(node.isDir);
            row.dataset.parent = parentPath;

            const chevron = document.createElement("span");
            chevron.className = "tree-chevron";
            chevron.textContent = node.isDir ? (isExpanded ? "▾" : "▸") : "";
            row.appendChild(chevron);

            const icon = document.createElement("span");
            icon.className = "tree-icon";
            icon.innerHTML = node.isDir
                ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z"/></svg>'
                : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 1.5h6.5L13 5v9.5H3z"/><path d="M9.5 1.5V5H13"/></svg>';
            row.appendChild(icon);

            const label = document.createElement("span");
            label.className = "tree-label";
            label.textContent = node.name;
            label.title = getRelativePathInWorkspace(ws.root, node.path);
            row.appendChild(label);

            if (node.isDir) {
                const actionsGroup = document.createElement("div");
                actionsGroup.className = "ws-actions";

                actionsGroup.appendChild(
                    createWorkspaceActionButton(
                        "new-file",
                        ws.root,
                        `Novo Arquivo .md em ${node.name}`,
                        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 1.5h6.5L13 5v9.5H3z"/><path d="M9.5 1.5V5H13"/><path d="M8 7.5v4M6 9.5h4"/></svg>',
                        false,
                        node.path,
                    ),
                );
                actionsGroup.appendChild(
                    createWorkspaceActionButton(
                        "new-folder",
                        ws.root,
                        `Nova Pasta em ${node.name}`,
                        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z"/><path d="M8 7v4M6 9h4"/></svg>',
                        false,
                        node.path,
                    ),
                );
                row.appendChild(actionsGroup);
            }

            row.addEventListener("click", (e) => {
                const target = e.target as HTMLElement | null;
                if (target && target.closest(".ws-actions")) {
                    return;
                }
                e.stopPropagation();
                closeContextMenu();
                selectedTreePath = node.path;
                selectedTreeIsDir = node.isDir;
                fileTreeEl.focus();

                if (node.isDir) {
                    if (expandedDirs.has(node.path)) {
                        expandedDirs.delete(node.path);
                    } else {
                        expandedDirs.add(node.path);
                    }
                    renderFileTree();
                    updateStatusBar();
                } else {
                    void openFileInTab(node.path, false);
                }
            });

            row.addEventListener("dblclick", (e) => {
                if (!node.isDir) {
                    e.stopPropagation();
                    void openFileInTab(node.path, true);
                }
            });

            row.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectedTreePath = node.path;
                selectedTreeIsDir = node.isDir;
                fileTreeEl.focus();
                renderFileTree();
                openTreeContextMenu(e.clientX, e.clientY, node);
            });

            container.appendChild(row);
        }

        if (node.isDir && expandedDirs.has(node.path)) {
            renderTreeChildren(
                ws,
                node.children || [],
                depth + 1,
                node.path,
                container,
            );
        }
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let conflictPopoverEl: HTMLElement | null = null;
let currentConflictAnchor: HTMLElement | null = null;

function getOrCreateConflictPopover(): HTMLElement {
    if (!conflictPopoverEl) {
        conflictPopoverEl = document.createElement("div");
        conflictPopoverEl.className = "inline-conflict-popover hidden";
        conflictPopoverEl.setAttribute("role", "alert");
        conflictPopoverEl.innerHTML = `
            <div class="inline-conflict-arrow"></div>
            <div class="inline-conflict-content">
                <svg class="inline-conflict-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
                    <circle cx="8" cy="8" r="7"/>
                    <line x1="8" y1="4.5" x2="8" y2="8.5"/>
                    <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
                </svg>
                <span class="inline-conflict-text"></span>
            </div>
        `;
        conflictPopoverEl.addEventListener("mousedown", (e) => {
            e.preventDefault();
            if (currentConflictAnchor) {
                currentConflictAnchor.focus();
            }
        });
        document.body.appendChild(conflictPopoverEl);
    }
    return conflictPopoverEl;
}

function positionConflictPopover(
    anchorEl: HTMLElement,
    popoverEl: HTMLElement,
): void {
    if (!anchorEl || !anchorEl.isConnected) {
        hideConflictModal();
        return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = popoverEl.offsetWidth || 270;

    let top = rect.bottom + 5;
    let left = rect.left;

    if (left + popoverWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - popoverWidth - 8);
    }
    if (left < 8) {
        left = 8;
    }

    if (top + (popoverEl.offsetHeight || 50) > window.innerHeight - 8) {
        top = Math.max(8, rect.top - (popoverEl.offsetHeight || 50) - 5);
        popoverEl.classList.add("flipped-above");
    } else {
        popoverEl.classList.remove("flipped-above");
    }

    popoverEl.style.top = `${top}px`;
    popoverEl.style.left = `${left}px`;

    const arrowEl = popoverEl.querySelector<HTMLElement>(
        ".inline-conflict-arrow",
    );
    if (arrowEl) {
        const arrowLeft = Math.max(
            12,
            Math.min(popoverWidth - 16, rect.left + 14 - left),
        );
        arrowEl.style.left = `${arrowLeft}px`;
    }
}

function showConflictModal(
    anchorInput: HTMLInputElement,
    existingName: string,
    isDir: boolean,
): void {
    currentConflictAnchor = anchorInput;
    anchorInput.classList.add("has-error");

    const popover = getOrCreateConflictPopover();
    const textEl = popover.querySelector<HTMLElement>(".inline-conflict-text");
    if (textEl) {
        const kindLabel = isDir ? "uma pasta" : "um arquivo";
        textEl.innerHTML = `Já existe ${kindLabel} com o nome <strong>"${escapeHtml(
            existingName,
        )}"</strong> neste local. Escolha outro nome.`;
    }

    popover.classList.remove("hidden");
    positionConflictPopover(anchorInput, popover);
}

function shakeConflictModal(): void {
    if (!conflictPopoverEl || conflictPopoverEl.classList.contains("hidden"))
        return;
    conflictPopoverEl.classList.remove("shake");
    void conflictPopoverEl.offsetWidth;
    conflictPopoverEl.classList.add("shake");
}

function hideConflictModal(): void {
    if (currentConflictAnchor) {
        currentConflictAnchor.classList.remove("has-error");
        currentConflictAnchor = null;
    }
    if (conflictPopoverEl) {
        conflictPopoverEl.classList.add("hidden");
        conflictPopoverEl.classList.remove("shake");
    }
}

function checkSiblingConflict(
    wsRoot: string,
    parentDir: string,
    candidateRawName: string,
    isDir: boolean,
    excludePath?: string,
): { exists: boolean; existingName: string; isDir: boolean } | null {
    const trimmed = candidateRawName.trim();
    if (!trimmed) return null;

    const finalName = isDir ? trimmed : ensureMdFileName(trimmed);
    const ws = findWorkspaceByRoot(wsRoot) || findWorkspaceOfPath(parentDir);
    if (!ws || !ws.tree) return null;

    const normParent = parentDir.replace(/\\/g, "/").replace(/\/+$/, "");
    const normWsRoot = ws.root.replace(/\\/g, "/").replace(/\/+$/, "");

    let siblings: main.FileNode[] = [];
    if (normParent === normWsRoot) {
        siblings = ws.tree.children || [];
    } else {
        const parentNode = findNodeByPath(ws.tree, normParent);
        siblings = parentNode?.children || [];
    }

    const normExclude = excludePath
        ? excludePath.replace(/\\/g, "/").replace(/\/+$/, "")
        : "";

    for (const sibling of siblings) {
        const normSiblingPath = sibling.path
            .replace(/\\/g, "/")
            .replace(/\/+$/, "");
        if (normExclude && normSiblingPath === normExclude) {
            continue;
        }
        if (
            sibling.name === finalName ||
            sibling.name.toLowerCase() === finalName.toLowerCase()
        ) {
            return {
                exists: true,
                existingName: sibling.name,
                isDir: sibling.isDir,
            };
        }
    }

    return null;
}

function createInlineTreeRow(
    depth: number,
    state: InlineTreeInputState,
): HTMLElement {
    const row = document.createElement("div");
    row.className = `tree-row ${state.isDir ? "is-dir" : "is-file"} selected`;
    row.style.paddingLeft = `${8 + depth * 14}px`;

    const chevron = document.createElement("span");
    chevron.className = "tree-chevron";
    chevron.textContent = state.isDir ? "▸" : "";
    row.appendChild(chevron);

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.innerHTML = state.isDir
        ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z"/></svg>'
        : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 1.5h6.5L13 5v9.5H3z"/><path d="M9.5 1.5V5H13"/></svg>';
    row.appendChild(icon);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tree-inline-input";
    input.value = state.initialValue;
    input.placeholder = state.isDir ? "nome-da-pasta" : "nome-do-arquivo.md";
    row.appendChild(input);

    let committed = false;

    const commit = async () => {
        if (committed) return;
        const rawValue = input.value.trim();
        const currentInline = inlineTreeState;

        if (!rawValue || !currentInline) {
            cancel();
            return;
        }

        const conflict = checkSiblingConflict(
            currentInline.wsRoot,
            currentInline.parentDir,
            rawValue,
            currentInline.isDir,
            currentInline.targetPath,
        );

        if (conflict) {
            showConflictModal(input, conflict.existingName, conflict.isDir);
            shakeConflictModal();
            input.focus();
            return;
        }

        committed = true;
        hideConflictModal();
        inlineTreeState = null;

        try {
            if (currentInline.mode === "create-file") {
                const finalName = ensureMdFileName(rawValue);
                const targetPath = joinPath(currentInline.parentDir, finalName);
                await CreateEntry(targetPath, false);
                selectedTreePath = targetPath;
                selectedTreeIsDir = false;
                await refreshWorkspaceTree(currentInline.wsRoot, false);
                await openFileInTab(targetPath, true);
                showStatusMessage(`Criado: ${finalName}`);
            } else if (currentInline.mode === "create-folder") {
                const targetPath = joinPath(currentInline.parentDir, rawValue);
                await CreateEntry(targetPath, true);
                expandedDirs.add(targetPath);
                selectedTreePath = targetPath;
                selectedTreeIsDir = true;
                await refreshWorkspaceTree(currentInline.wsRoot, false);
                fileTreeEl.focus();
                showStatusMessage(`Pasta criada: ${rawValue}`);
            } else if (
                currentInline.mode === "rename" &&
                currentInline.targetPath
            ) {
                const destName = currentInline.isDir
                    ? rawValue
                    : ensureMdFileName(rawValue);
                const newPath = joinPath(
                    getDirName(currentInline.targetPath),
                    destName,
                );
                await relocateEntry(
                    currentInline.targetPath,
                    newPath,
                    currentInline.isDir,
                );
                fileTreeEl.focus();
            }
        } catch (err) {
            const errStr = String(err);
            if (
                errStr.includes("já existe") ||
                errStr.includes("already exists")
            ) {
                committed = false;
                inlineTreeState = currentInline;
                showConflictModal(input, rawValue, currentInline.isDir);
                shakeConflictModal();
                input.focus();
                return;
            }
            showStatusMessage(`Erro: ${errStr}`);
            renderFileTree();
            fileTreeEl.focus();
        }
    };

    const cancel = () => {
        if (committed) return;
        committed = true;
        hideConflictModal();
        inlineTreeState = null;
        renderFileTree();
        fileTreeEl.focus();
    };

    input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
            e.preventDefault();
            void commit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
        }
    });

    input.addEventListener("input", () => {
        if (!inlineTreeState) return;
        const rawValue = input.value.trim();
        const conflict = checkSiblingConflict(
            inlineTreeState.wsRoot,
            inlineTreeState.parentDir,
            rawValue,
            inlineTreeState.isDir,
            inlineTreeState.targetPath,
        );
        if (conflict) {
            showConflictModal(input, conflict.existingName, conflict.isDir);
        } else {
            hideConflictModal();
        }
    });

    input.addEventListener("blur", () => {
        if (
            conflictPopoverEl &&
            conflictPopoverEl.contains(document.activeElement)
        ) {
            return;
        }
        const rawValue = input.value.trim();
        if (!inlineTreeState) return;

        const conflict = checkSiblingConflict(
            inlineTreeState.wsRoot,
            inlineTreeState.parentDir,
            rawValue,
            inlineTreeState.isDir,
            inlineTreeState.targetPath,
        );

        if (conflict) {
            cancel();
        } else {
            void commit();
        }
    });

    queueMicrotask(() => {
        row.scrollIntoView({ block: "nearest" });
        input.focus();
        const dotIdx = input.value.lastIndexOf(".");
        if (!state.isDir && dotIdx > 0) {
            input.setSelectionRange(0, dotIdx);
        } else {
            input.select();
        }
        const initialConflict = checkSiblingConflict(
            state.wsRoot,
            state.parentDir,
            input.value,
            state.isDir,
            state.targetPath,
        );
        if (initialConflict) {
            showConflictModal(
                input,
                initialConflict.existingName,
                initialConflict.isDir,
            );
        }
    });

    return row;
}

// Shared Relocate/Rename Logic (used by Sidebar Rename, Tab Rename, and Sidebar Drag-Move)
async function relocateEntry(
    oldPath: string,
    rawNewPath: string,
    isDir: boolean,
): Promise<void> {
    const finalNewPath = isDir ? rawNewPath : ensureMdFileName(rawNewPath);
    const finalName = getBaseName(finalNewPath);

    if (finalNewPath === oldPath) {
        renderTabs();
        renderFileTree();
        return;
    }

    const owningWs = findWorkspaceOfPath(oldPath);

    await RenameEntry(oldPath, finalNewPath);

    // Update manualOrder keys if renamed within the same parent or moved across parents
    const oldParent = getDirName(oldPath);
    const newParent = getDirName(finalNewPath);
    const oldName = getBaseName(oldPath);

    if (owningWs && appSettings.manualOrder?.[owningWs.root]) {
        const oldList = getManualOrderList(owningWs.root, oldParent);
        if (oldList.length > 0) {
            if (oldParent === newParent) {
                const updated = oldList.map((n) =>
                    n === oldName ? finalName : n,
                );
                setManualOrderList(owningWs.root, oldParent, updated);
            } else {
                setManualOrderList(
                    owningWs.root,
                    oldParent,
                    oldList.filter((n) => n !== oldName),
                );
            }
        }
    }

    // Synchronize open tabs if this file or a parent directory was renamed/moved
    for (const tab of openTabs) {
        if (tab.path === oldPath) {
            const wasActive = activeTabPath === tab.path;
            tab.path = finalNewPath;
            tab.name = finalName;
            const currentDoc =
                wasActive && editorView
                    ? editorView.state.doc.toString()
                    : tab.state.doc.toString();
            tab.state = buildEditorStateForTab(finalNewPath, currentDoc);
            if (wasActive) {
                activeTabPath = finalNewPath;
                if (editorView) {
                    editorView.setState(tab.state);
                }
            }
        } else if (isDir && tab.path.startsWith(oldPath + "/")) {
            const suffix = tab.path.slice(oldPath.length);
            const updatedTabPath = finalNewPath + suffix;
            const wasActive = activeTabPath === tab.path;
            tab.path = updatedTabPath;
            const currentDoc =
                wasActive && editorView
                    ? editorView.state.doc.toString()
                    : tab.state.doc.toString();
            tab.state = buildEditorStateForTab(updatedTabPath, currentDoc);
            if (wasActive) {
                activeTabPath = updatedTabPath;
                if (editorView) {
                    editorView.setState(tab.state);
                }
            }
        }
    }

    if (selectedTreePath === oldPath) {
        selectedTreePath = finalNewPath;
        selectedTreeIsDir = isDir;
    } else if (isDir && selectedTreePath.startsWith(oldPath + "/")) {
        selectedTreePath =
            finalNewPath + selectedTreePath.slice(oldPath.length);
    }

    if (isDir) {
        const updatedExpanded: string[] = [];
        expandedDirs.forEach((dir) => {
            if (dir === oldPath) {
                updatedExpanded.push(finalNewPath);
            } else if (dir.startsWith(oldPath + "/")) {
                updatedExpanded.push(finalNewPath + dir.slice(oldPath.length));
            } else {
                updatedExpanded.push(dir);
            }
        });
        expandedDirs.clear();
        updatedExpanded.forEach((d) => expandedDirs.add(d));
    }

    await persistAppSettings();
    await refreshWorkspaceTree(owningWs?.root, false);
    renderTabs();
    updateStatusBar();
    showStatusMessage(
        oldParent === newParent
            ? `Renomeado para ${finalName}`
            : `Movido: ${finalName} → ${getRelativePath(newParent)}`,
    );
}

// Start Creating File or Folder
function resolveTargetParentDir(): string {
    if (workspaces.length === 0) return "";
    if (selectedTreePath) {
        const ws = findWorkspaceOfPath(selectedTreePath);
        if (ws) {
            return selectedTreeIsDir
                ? selectedTreePath
                : getDirName(selectedTreePath);
        }
    }
    return workspaces[0].root;
}

async function startCreateEntry(
    isDir: boolean,
    explicitDir?: string,
): Promise<void> {
    hideConflictModal();
    if (workspaces.length === 0) {
        const addedRoot = await handleSelectWorkspaceFolder();
        if (!addedRoot) return;
    }

    const parentDir = explicitDir || resolveTargetParentDir();
    if (!parentDir) return;

    const ws = findWorkspaceOfPath(parentDir);
    if (!ws) return;

    workbenchEl.classList.remove("sidebar-collapsed");
    expandedDirs.add(ws.root);
    expandedDirs.add(parentDir);

    inlineTreeState = {
        mode: isDir ? "create-folder" : "create-file",
        wsRoot: ws.root,
        parentDir,
        initialValue: isDir ? "nova-pasta" : "novo-arquivo.md",
        isDir,
    };

    renderFileTree();
}

function startTreeRename(targetPath: string, isDir: boolean): void {
    hideConflictModal();
    if (!targetPath || isWorkspaceRoot(targetPath)) return;
    const ws = findWorkspaceOfPath(targetPath);
    if (!ws) return;

    inlineTreeState = {
        mode: "rename",
        wsRoot: ws.root,
        parentDir: getDirName(targetPath),
        targetPath,
        initialValue: getBaseName(targetPath),
        isDir,
    };
    renderFileTree();
}

function startTabInlineRename(tabPath: string): void {
    hideConflictModal();
    inlineTabRenamePath = tabPath;
    renderTabs();
}

// Remove Workspace from Sidebar (Does NOT delete any files on disk)
async function performRemoveWorkspace(wsRoot: string): Promise<void> {
    const ws = findWorkspaceByRoot(wsRoot);
    if (!ws) return;
    const wsName = ws.tree?.name || getBaseName(wsRoot);

    // Close all open tabs belonging to this workspace
    const tabsToClose = openTabs
        .filter((t) => t.path === wsRoot || t.path.startsWith(wsRoot + "/"))
        .map((t) => t.path);
    for (const p of tabsToClose) {
        forceCloseTab(p);
    }

    try {
        await RemoveWorkspaceRoot(wsRoot);
    } catch {
        // Ignore if running outside Wails runtime
    }

    workspaces = workspaces.filter((w) => w.root !== wsRoot);

    const dirsToRemove: string[] = [];
    expandedDirs.forEach((d) => {
        if (d === wsRoot || d.startsWith(wsRoot + "/")) {
            dirsToRemove.push(d);
        }
    });
    dirsToRemove.forEach((d) => expandedDirs.delete(d));

    if (
        selectedTreePath === wsRoot ||
        selectedTreePath.startsWith(wsRoot + "/")
    ) {
        selectedTreePath = workspaces[0]?.root || "";
        selectedTreeIsDir = Boolean(selectedTreePath);
    }

    await persistAppSettings();
    renderFileTree();
    updateStatusBar();
    showStatusMessage(
        `Workspace "${wsName}" removido da sidebar (arquivos preservados no disco)`,
    );
}

function requestRemoveWorkspace(wsRoot: string): void {
    const ws = findWorkspaceByRoot(wsRoot);
    if (!ws) return;
    const wsName = ws.tree?.name || getBaseName(wsRoot);
    const restoreSidebarFocus = document.activeElement === fileTreeEl;

    openModal(
        "Remover Workspace",
        `Deseja remover o workspace "${wsName}" da barra lateral? Nenhum arquivo ou pasta será apagado do disco rígido.`,
        [
            {
                label: "Cancelar",
                className: "action-btn",
                autoFocus: true,
                onClick: () => {
                    closeModal();
                    if (restoreSidebarFocus) fileTreeEl.focus();
                },
            },
            {
                label: "Remover Workspace",
                className: "action-btn danger",
                onClick: () => {
                    closeModal();
                    const dirtyWsTabs = openTabs.filter(
                        (t) =>
                            t.isDirty &&
                            (t.path === wsRoot ||
                                t.path.startsWith(wsRoot + "/")),
                    );

                    if (dirtyWsTabs.length === 0) {
                        void performRemoveWorkspace(wsRoot).then(() => {
                            if (restoreSidebarFocus) fileTreeEl.focus();
                        });
                        return;
                    }

                    const dirtyNames = dirtyWsTabs
                        .map((t) => t.name)
                        .join(", ");
                    openModal(
                        "Abas com Alterações Não Salvas",
                        `O workspace "${wsName}" possui abas abertas com alterações não salvas (${dirtyNames}). Deseja salvar antes de remover o workspace da sidebar?`,
                        [
                            {
                                label: "Cancelar",
                                className: "action-btn",
                                autoFocus: true,
                                onClick: () => {
                                    closeModal();
                                    if (restoreSidebarFocus) fileTreeEl.focus();
                                },
                            },
                            {
                                label: "Descartar e Remover",
                                className: "action-btn danger",
                                onClick: () => {
                                    closeModal();
                                    void performRemoveWorkspace(wsRoot).then(
                                        () => {
                                            if (restoreSidebarFocus)
                                                fileTreeEl.focus();
                                        },
                                    );
                                },
                            },
                            {
                                label: "Salvar Tudo e Remover",
                                className: "action-btn primary",
                                onClick: async () => {
                                    closeModal();
                                    for (const t of dirtyWsTabs) {
                                        const ok = await saveTab(t.path);
                                        if (!ok) return;
                                    }
                                    await performRemoveWorkspace(wsRoot);
                                    if (restoreSidebarFocus) fileTreeEl.focus();
                                },
                            },
                        ],
                    );
                },
            },
        ],
    );
}

// Delete Entry with Confirmation Modal (used by Top Tab Bar, Left Sidebar, and Delete/Backspace key)
function requestDeleteEntry(targetPath: string, isDir: boolean): void {
    if (!targetPath || isWorkspaceRoot(targetPath)) return;
    const owningWs = findWorkspaceOfPath(targetPath);
    const name = getBaseName(targetPath);
    const kindLabel = isDir ? "a pasta" : "o arquivo";
    const restoreSidebarFocus = document.activeElement === fileTreeEl;

    openModal(
        `Excluir ${isDir ? "Pasta" : "Arquivo"}`,
        `Tem certeza que deseja excluir permanentemente ${kindLabel} "${name}" do disco? Esta ação não pode ser desfeita.`,
        [
            {
                label: "Cancelar",
                className: "action-btn",
                autoFocus: true,
                onClick: () => {
                    closeModal();
                    if (restoreSidebarFocus) fileTreeEl.focus();
                },
            },
            {
                label: "Excluir Permanentemente",
                className: "action-btn danger",
                onClick: async () => {
                    closeModal();
                    try {
                        // Find adjacent visible item to select after deletion
                        const currentIdx = visibleTreeNodes.findIndex(
                            (n) => n.path === targetPath,
                        );
                        let nextSelectedPath =
                            owningWs?.root || workspaces[0]?.root || "";
                        let nextSelectedIsDir = true;
                        if (currentIdx >= 0) {
                            const candidate =
                                visibleTreeNodes[currentIdx + 1] ||
                                visibleTreeNodes[currentIdx - 1];
                            if (
                                candidate &&
                                candidate.path !== targetPath &&
                                !(
                                    isDir &&
                                    candidate.path.startsWith(targetPath + "/")
                                )
                            ) {
                                nextSelectedPath = candidate.path;
                                nextSelectedIsDir = candidate.isDir;
                            }
                        }

                        await DeleteEntry(targetPath);

                        const tabsToClose = openTabs
                            .filter(
                                (t) =>
                                    t.path === targetPath ||
                                    (isDir &&
                                        t.path.startsWith(targetPath + "/")),
                            )
                            .map((t) => t.path);

                        for (const p of tabsToClose) {
                            forceCloseTab(p);
                        }

                        if (
                            selectedTreePath === targetPath ||
                            (isDir &&
                                selectedTreePath.startsWith(targetPath + "/"))
                        ) {
                            selectedTreePath = nextSelectedPath;
                            selectedTreeIsDir = nextSelectedIsDir;
                        }

                        await refreshWorkspaceTree(owningWs?.root, false);
                        if (restoreSidebarFocus) fileTreeEl.focus();
                        showStatusMessage(`Excluído: ${name}`);
                    } catch (err) {
                        showStatusMessage(`Erro ao excluir: ${String(err)}`);
                        if (restoreSidebarFocus) fileTreeEl.focus();
                    }
                },
            },
        ],
    );
}

// Tab Management & Editor Synchronization
async function openFileInTab(
    filePath: string,
    focusEditor = true,
): Promise<void> {
    const existing = openTabs.find((t) => t.path === filePath);
    if (existing) {
        activateTab(existing.path, focusEditor);
        return;
    }

    try {
        const doc = await ReadFile(filePath);
        const lineEnding: "LF" | "CRLF" =
            doc.lineEnding === "CRLF" ? "CRLF" : "LF";
        const state = buildEditorStateForTab(doc.path, doc.content);

        const newTab: OpenTab = {
            path: doc.path,
            name: doc.name,
            savedContent: doc.content,
            lineEnding,
            isDirty: false,
            state,
            scrollTop: 0,
            scrollLeft: 0,
            docStatsCache: computeTextStats(doc.content),
        };

        openTabs.push(newTab);
        activateTab(newTab.path, focusEditor);
    } catch (err) {
        showStatusMessage(`Erro ao ler arquivo: ${String(err)}`);
    }
}

function saveOutgoingTabScrollAndState(): void {
    if (!editorView || !activeTabPath) return;
    const currentTab = openTabs.find((t) => t.path === activeTabPath);
    if (!currentTab) return;

    currentTab.state = editorView.state;
    currentTab.scrollTop = editorView.scrollDOM.scrollTop;
    currentTab.scrollLeft = editorView.scrollDOM.scrollLeft;
}

function activateTab(tabPath: string, focusEditor = true): void {
    const targetTab = openTabs.find((t) => t.path === tabPath);
    if (!targetTab) {
        if (openTabs.length === 0) {
            activeTabPath = "";
            editorContainerEl.classList.add("hidden");
            emptyStateEl.classList.remove("hidden");
            renderTabs();
            renderFileTree();
            updateStatusBar();
        }
        return;
    }

    if (activeTabPath && activeTabPath !== tabPath) {
        saveOutgoingTabScrollAndState();
    }

    activeTabPath = targetTab.path;
    selectedTreePath = targetTab.path;
    selectedTreeIsDir = false;

    emptyStateEl.classList.add("hidden");
    editorContainerEl.classList.remove("hidden");

    const view = ensureEditorView(targetTab.state);
    view.scrollDOM.scrollTop = targetTab.scrollTop;
    view.scrollDOM.scrollLeft = targetTab.scrollLeft;
    if (focusEditor) {
        view.focus();
    } else {
        fileTreeEl.focus();
    }

    renderTabs();
    renderFileTree();
    updateStatusBar();
}

// Reorder Tabs (Mouse Pointer Drag & Keyboard Ctrl+Shift+PageUp/PageDown)
function handleTabReorder(
    sourcePath: string,
    targetPath: string,
    position: TabDropPosition,
): void {
    const fromIdx = openTabs.findIndex((t) => t.path === sourcePath);
    if (fromIdx === -1) return;

    const [moved] = openTabs.splice(fromIdx, 1);
    const toIdx = openTabs.findIndex((t) => t.path === targetPath);
    if (toIdx === -1) {
        openTabs.push(moved);
    } else {
        const insertIdx = position === "before" ? toIdx : toIdx + 1;
        openTabs.splice(insertIdx, 0, moved);
    }
    renderTabs();
}

function moveActiveTabByOffset(offset: -1 | 1): void {
    if (openTabs.length < 2 || !activeTabPath) return;
    const idx = openTabs.findIndex((t) => t.path === activeTabPath);
    if (idx === -1) return;

    const nextIdx = idx + offset;
    if (nextIdx < 0 || nextIdx >= openTabs.length) return;

    const [moved] = openTabs.splice(idx, 1);
    openTabs.splice(nextIdx, 0, moved);
    renderTabs();
}

function requestCloseTab(tabPath: string): void {
    const tab = openTabs.find((t) => t.path === tabPath);
    if (!tab) return;

    if (activeTabPath === tab.path && editorView) {
        tab.state = editorView.state;
    }

    if (tab.path.startsWith("untitled:") && tab.state.doc.length === 0) {
        forceCloseTab(tabPath);
        return;
    }

    if (!tab.isDirty) {
        forceCloseTab(tabPath);
        return;
    }

    openModal(
        "Alterações Não Salvas",
        `O arquivo "${tab.name}" possui modificações não salvas. Deseja salvar antes de fechar a aba?`,
        [
            {
                label: "Cancelar",
                className: "action-btn",
                autoFocus: true,
                onClick: () => closeModal(),
            },
            {
                label: "Descartar",
                className: "action-btn danger",
                onClick: () => {
                    closeModal();
                    forceCloseTab(tabPath);
                },
            },
            {
                label: "Salvar e Fechar",
                className: "action-btn primary",
                onClick: async () => {
                    closeModal();
                    const saved = await saveTab(tabPath);
                    if (saved) {
                        forceCloseTab(tabPath);
                    }
                },
            },
        ],
    );
}

function forceCloseTab(tabPath: string): void {
    const idx = openTabs.findIndex((t) => t.path === tabPath);
    if (idx === -1) return;

    const wasActive = activeTabPath === tabPath;
    openTabs.splice(idx, 1);
    syncDirtyStateWithBackend();

    if (openTabs.length === 0) {
        activeTabPath = "";
        editorContainerEl.classList.add("hidden");
        emptyStateEl.classList.remove("hidden");
        renderTabs();
        renderFileTree();
        updateStatusBar();
        return;
    }

    if (wasActive) {
        const nextIdx = Math.min(idx, openTabs.length - 1);
        activateTab(openTabs[nextIdx].path, true);
    } else {
        renderTabs();
    }
}

let untitledCounter = 1;

function createNewUntitledTab(): void {
    const title = `Sem título-${untitledCounter++}`;
    const tabPath = `untitled:${title}`;
    const state = buildEditorStateForTab(tabPath, "");
    const newTab: OpenTab = {
        path: tabPath,
        name: `${title}.md`,
        isDirty: true,
        savedContent: "",
        lineEnding: "LF",
        state,
        scrollTop: 0,
        scrollLeft: 0,
        docStatsCache: computeTextStats(""),
    };
    openTabs.push(newTab);
    activateTab(newTab.path, true);
    syncDirtyStateWithBackend();
    showTemporaryStatus(`Nova guia: ${title}`);
}

function closeActiveTab(): void {
    if (!activeTabPath) return;
    requestCloseTab(activeTabPath);
}

async function saveAndCloseAllTabs(): Promise<void> {
    for (const tab of [...openTabs]) {
        if (tab.isDirty) {
            if (tab.path.startsWith("untitled:") && tab.state.doc.length === 0) {
                continue;
            }
            const ok = await saveTab(tab.path);
            if (!ok) return;
        }
    }
    const allPaths = openTabs.map((t) => t.path);
    for (const p of allPaths) {
        forceCloseTab(p);
    }
    showTemporaryStatus("Todas as abas salvas e fechadas");
}

async function finalizeSaveTab(
    tab: OpenTab,
    targetPath: string,
): Promise<boolean> {
    try {
        const content = tab.state.doc.toString();
        recentSelfSaves.set(targetPath, Date.now());
        await SaveFile(targetPath, content, tab.lineEnding);

        const oldPath = tab.path;
        tab.path = targetPath;
        tab.name = getBaseName(targetPath);
        tab.savedContent = content;
        tab.isDirty = false;

        if (activeTabPath === oldPath) {
            activeTabPath = targetPath;
        }

        const ws = findWorkspaceOfPath(targetPath);
        if (ws) {
            await refreshWorkspaceTree(ws.root, false);
        }

        renderTabs();
        renderFileTree();
        syncDirtyStateWithBackend();
        updateStatusBar();
        showTemporaryStatus(`Salvo: ${tab.name}`);
        return true;
    } catch (err) {
        showStatusMessage(`Erro ao salvar: ${String(err)}`);
        return false;
    }
}

// Monochrome 13x13 SVG icons matching Gecko's File Tree DNA (Zero Emojis)
const GECKO_SVG_FOLDER =
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z"/></svg>';
const GECKO_SVG_NEW_FOLDER =
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z"/><path d="M8 6.5v4M6 8.5h4"/></svg>';
const GECKO_SVG_UP_DIR =
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 12.5V3.5M4.5 7L8 3.5 11.5 7"/></svg>';

interface QuickDirectoryItem {
    section: string;
    label: string;
    meta: string;
    path: string;
}

interface GeckoDirectoryBrowserOptions {
    quickTabLabel: string;
    quickItems: QuickDirectoryItem[];
    initialSelectedPath: string;
    initialComputerPath: string;
    initialTab?: "quick" | "computer";
    onSelectionChange: (selectedDirPath: string) => void;
    onConfirmSelection: (confirmedDirPath: string) => void;
}

interface GeckoDirectoryBrowserInstance {
    element: HTMLElement;
    filterInput: HTMLInputElement;
    getSelectedPath: () => string;
    handleArrowKey: (dir: number) => void;
    handleEnter: () => boolean;
    handleBackspace: () => boolean;
    handleHome: () => void;
    handleEnd: () => void;
    handleModalKeyDown: (e: KeyboardEvent) => boolean;
}

function createGeckoDirectoryBrowser(
    opts: GeckoDirectoryBrowserOptions,
): GeckoDirectoryBrowserInstance {
    let activeTab: "quick" | "computer" =
        opts.initialTab || (opts.quickItems.length > 0 ? "quick" : "computer");
    let selectedPath = opts.initialSelectedPath || opts.initialComputerPath;
    let currentComputerPath = opts.initialComputerPath || selectedPath;
    let parentComputerPath = "";
    let computerDirs: main.DirectoryEntry[] = [];
    let showHidden = false;
    let isCreatingInlineFolder = false;

    interface RenderedRowItem {
        type: "quick" | "current-dir" | "up-dir" | "sub-dir";
        label: string;
        meta: string;
        path: string;
        section?: string;
    }

    let currentRows: RenderedRowItem[] = [];
    let rowEls: HTMLElement[] = [];

    const box = document.createElement("div");
    box.className = "gecko-browser-box";

    // Header: Tabs + Tools (.ocultos & + Nova Pasta)
    const header = document.createElement("div");
    header.className = "gecko-browser-header";

    const tabsWrap = document.createElement("div");
    tabsWrap.className = "gecko-browser-tabs";
    tabsWrap.setAttribute("role", "tablist");

    const tabQuickBtn = document.createElement("button");
    tabQuickBtn.type = "button";
    tabQuickBtn.setAttribute("role", "tab");
    tabQuickBtn.setAttribute("aria-selected", String(activeTab === "quick"));
    tabQuickBtn.className = `gecko-browser-tab${activeTab === "quick" ? " active" : ""}`;
    tabQuickBtn.textContent = opts.quickTabLabel;

    const tabComputerBtn = document.createElement("button");
    tabComputerBtn.type = "button";
    tabComputerBtn.setAttribute("role", "tab");
    tabComputerBtn.setAttribute(
        "aria-selected",
        String(activeTab === "computer"),
    );
    tabComputerBtn.className = `gecko-browser-tab${activeTab === "computer" ? " active" : ""}`;
    tabComputerBtn.textContent = "Navegar no Computador";

    tabsWrap.appendChild(tabQuickBtn);
    tabsWrap.appendChild(tabComputerBtn);

    const toolsWrap = document.createElement("div");
    toolsWrap.className = "gecko-browser-tools";

    const btnToggleHidden = document.createElement("button");
    btnToggleHidden.type = "button";
    btnToggleHidden.className = `gecko-browser-tool-btn${activeTab === "computer" ? "" : " hidden"}`;
    btnToggleHidden.title = "Mostrar/Ocultar pastas iniciadas por ponto (.)";
    btnToggleHidden.textContent = ".ocultos";

    const btnNewFolder = document.createElement("button");
    btnNewFolder.type = "button";
    btnNewFolder.className = "gecko-browser-tool-btn";
    btnNewFolder.title = "Criar nova pasta neste local";
    btnNewFolder.innerHTML = `${GECKO_SVG_NEW_FOLDER}<span>Nova Pasta</span>`;

    toolsWrap.appendChild(btnToggleHidden);
    toolsWrap.appendChild(btnNewFolder);

    header.appendChild(tabsWrap);
    header.appendChild(toolsWrap);
    box.appendChild(header);

    // Path bar (visible in computer tab)
    const pathBar = document.createElement("div");
    pathBar.className = `gecko-browser-pathbar${activeTab === "computer" ? "" : " hidden"}`;

    const btnUpDir = document.createElement("button");
    btnUpDir.type = "button";
    btnUpDir.className = "gecko-browser-up-btn";
    btnUpDir.title = "Subir para pasta pai (Backspace)";
    btnUpDir.innerHTML = `${GECKO_SVG_UP_DIR}<span>..</span>`;

    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.className = "gecko-browser-path-input";
    pathInput.dataset.customEnter = "true";
    pathInput.placeholder = "/caminho/do/diretorio";
    pathInput.title = "Digite um caminho e pressione Enter para ir até ele";

    pathBar.appendChild(btnUpDir);
    pathBar.appendChild(pathInput);
    box.appendChild(pathBar);

    // Filter input
    const filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.className = "gecko-browser-filter";
    filterInput.dataset.customEnter = "true";
    filterInput.placeholder =
        activeTab === "quick"
            ? "Filtrar destino por nome ou caminho..."
            : 'Filtrar pastas neste local (digite "." para ver pastas ocultas)...';
    box.appendChild(filterInput);

    // Directory list container (sem tabindex para não prender Tab!)
    const listEl = document.createElement("div");
    listEl.className = "gecko-browser-list";
    listEl.setAttribute("role", "listbox");
    box.appendChild(listEl);

    const setSelectedPath = (newPath: string) => {
        if (!newPath) return;
        selectedPath = newPath;
        opts.onSelectionChange(selectedPath);
    };

    const listNav: ListNavigator = createListNavigator({
        container: listEl,
        getItems: () => rowEls,
        orientation: "vertical",
        mode: "virtual",
        wrap: true,
        pageSize: 5,
        onSelect: (idx) => {
            const target = currentRows[idx];
            if (target && target.type !== "up-dir") {
                setSelectedPath(target.path);
            }
        },
        onActivate: () => {
            handleEnter();
        },
    });

    const loadComputerDirectory = async (dirPath: string) => {
        try {
            const listing = await ListSystemDirectory(dirPath);
            currentComputerPath = listing.currentPath;
            parentComputerPath = listing.parentPath || "";
            computerDirs = listing.directories || [];
            pathInput.value = currentComputerPath;
            btnUpDir.disabled = !parentComputerPath;
            setSelectedPath(currentComputerPath);
            renderRows(0);
        } catch (err) {
            showStatusMessage(`Erro ao ler diretório: ${String(err)}`);
        }
    };

    const switchTab = (tab: "quick" | "computer") => {
        activeTab = tab;
        isCreatingInlineFolder = false;
        tabQuickBtn.classList.toggle("active", tab === "quick");
        tabQuickBtn.setAttribute("aria-selected", String(tab === "quick"));
        tabComputerBtn.classList.toggle("active", tab === "computer");
        tabComputerBtn.setAttribute(
            "aria-selected",
            String(tab === "computer"),
        );
        pathBar.classList.toggle("hidden", tab !== "computer");
        btnToggleHidden.classList.toggle("hidden", tab !== "computer");
        filterInput.value = "";
        filterInput.placeholder =
            tab === "quick"
                ? "Filtrar destino por nome ou caminho..."
                : 'Filtrar pastas neste local (digite "." para ver pastas ocultas)...';

        if (tab === "computer") {
            void loadComputerDirectory(selectedPath || currentComputerPath);
        } else {
            const targetIdx = Math.max(
                0,
                opts.quickItems.findIndex((i) => i.path === selectedPath),
            );
            if (opts.quickItems[targetIdx]) {
                setSelectedPath(opts.quickItems[targetIdx].path);
            }
            renderRows(targetIdx);
        }
    };

    const startInlineNewFolder = () => {
        if (activeTab !== "computer") {
            switchTab("computer");
            setTimeout(() => startInlineNewFolder(), 30);
            return;
        }
        isCreatingInlineFolder = true;
        renderRows(listNav.getIndex());
    };

    const buildRows = (): RenderedRowItem[] => {
        const rawFilter = filterInput.value.trim();
        const filter = rawFilter.toLowerCase();
        const rows: RenderedRowItem[] = [];

        if (activeTab === "quick") {
            for (const item of opts.quickItems) {
                if (
                    !filter ||
                    item.label.toLowerCase().includes(filter) ||
                    item.path.toLowerCase().includes(filter) ||
                    item.meta.toLowerCase().includes(filter)
                ) {
                    rows.push({
                        type: "quick",
                        label: item.label,
                        meta: item.meta,
                        path: item.path,
                        section: item.section,
                    });
                }
            }
            return rows;
        }

        // Computer navigation mode
        const baseCurrentName =
            getBaseName(currentComputerPath) || currentComputerPath;
        if (!filter) {
            rows.push({
                type: "current-dir",
                label: `${baseCurrentName} (Pasta Atual)`,
                meta: currentComputerPath,
                path: currentComputerPath,
            });
            if (parentComputerPath) {
                rows.push({
                    type: "up-dir",
                    label: ".. (Subir para pasta pai)",
                    meta: parentComputerPath,
                    path: parentComputerPath,
                });
            }
        }

        const revealHidden = showHidden || rawFilter.startsWith(".");
        for (const d of computerDirs) {
            if (d.isHidden && !revealHidden) continue;
            if (filter && !d.name.toLowerCase().includes(filter)) continue;
            rows.push({
                type: "sub-dir",
                label: d.name,
                meta: "Entrar ↵",
                path: d.path,
            });
        }

        return rows;
    };

    const renderRows = (targetIndex?: number) => {
        listEl.innerHTML = "";
        rowEls = [];

        if (isCreatingInlineFolder && activeTab === "computer") {
            const inlineRow = document.createElement("div");
            inlineRow.className = "gecko-browser-inline-row";

            const iconSpan = document.createElement("span");
            iconSpan.className = "gecko-browser-row-icon";
            iconSpan.innerHTML = GECKO_SVG_NEW_FOLDER;

            const inlineInput = document.createElement("input");
            inlineInput.type = "text";
            inlineInput.className = "tree-inline-input";
            inlineInput.dataset.customEnter = "true";
            inlineInput.dataset.customEscape = "true";
            inlineInput.placeholder =
                "Nome da nova pasta (Enter para criar, Esc para cancelar)";

            let committed = false;
            const cancelInline = () => {
                if (committed) return;
                committed = true;
                isCreatingInlineFolder = false;
                renderRows(listNav.getIndex());
                filterInput.focus();
            };

            const commitInline = async () => {
                if (committed) return;
                const folderName = inlineInput.value.trim();
                if (!folderName) {
                    cancelInline();
                    return;
                }
                try {
                    const createdPath = await CreateDirectoryAtPath(
                        currentComputerPath,
                        folderName,
                    );
                    committed = true;
                    isCreatingInlineFolder = false;
                    filterInput.value = "";
                    await loadComputerDirectory(createdPath);
                    filterInput.focus();
                } catch (err: any) {
                    inlineInput.classList.add("has-error");
                    showStatusMessage(String(err?.message || err));
                }
            };

            inlineInput.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    ev.stopPropagation();
                    void commitInline();
                } else if (ev.key === "Escape") {
                    ev.preventDefault();
                    ev.stopPropagation();
                    cancelInline();
                }
            });

            inlineInput.addEventListener("blur", () => {
                setTimeout(() => cancelInline(), 120);
            });

            inlineRow.appendChild(iconSpan);
            inlineRow.appendChild(inlineInput);
            listEl.appendChild(inlineRow);
            queueMicrotask(() => inlineInput.focus());
        }

        currentRows = buildRows();

        if (currentRows.length === 0) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "gecko-browser-empty";
            emptyEl.textContent =
                activeTab === "quick"
                    ? "Nenhum destino rápido encontrado. Use a aba 'Navegar no Computador'."
                    : "Nenhuma subpasta encontrada neste diretório.";
            listEl.appendChild(emptyEl);
            return;
        }

        const nextIdx =
            targetIndex !== undefined
                ? Math.max(0, Math.min(currentRows.length - 1, targetIndex))
                : Math.max(
                      0,
                      Math.min(currentRows.length - 1, listNav.getIndex()),
                  );

        let lastSection = "";
        currentRows.forEach((rowItem, idx) => {
            if (
                activeTab === "quick" &&
                rowItem.section &&
                rowItem.section !== lastSection
            ) {
                const secEl = document.createElement("div");
                secEl.className = "gecko-browser-section";
                secEl.textContent = rowItem.section;
                listEl.appendChild(secEl);
                lastSection = rowItem.section;
            }

            const rowEl = document.createElement("div");
            rowEl.className = "gecko-browser-row";
            rowEl.setAttribute("role", "option");

            const mainPart = document.createElement("div");
            mainPart.className = "gecko-browser-row-main";

            const iconSpan = document.createElement("span");
            iconSpan.className = "gecko-browser-row-icon";
            iconSpan.innerHTML =
                rowItem.type === "up-dir" ? GECKO_SVG_UP_DIR : GECKO_SVG_FOLDER;

            const nameSpan = document.createElement("span");
            nameSpan.className = "gecko-browser-row-name";
            nameSpan.textContent = rowItem.label;

            mainPart.appendChild(iconSpan);
            mainPart.appendChild(nameSpan);

            const metaSpan = document.createElement("span");
            metaSpan.className = "gecko-browser-row-meta";
            metaSpan.textContent = rowItem.meta;

            rowEl.appendChild(mainPart);
            rowEl.appendChild(metaSpan);

            rowEl.setAttribute("tabindex", "-1");
            rowEl.setAttribute("data-row-index", String(idx));

            rowEl.addEventListener("click", () => {
                if (rowItem.type === "up-dir") {
                    filterInput.value = "";
                    void loadComputerDirectory(rowItem.path);
                    filterInput.focus();
                    return;
                }
                listNav.setIndex(idx, { notify: true, scroll: true });
                filterInput.focus();
            });

            rowEl.addEventListener("dblclick", () => {
                if (activeTab === "computer") {
                    if (
                        rowItem.type === "sub-dir" ||
                        rowItem.type === "up-dir"
                    ) {
                        filterInput.value = "";
                        void loadComputerDirectory(rowItem.path);
                        filterInput.focus();
                        return;
                    }
                }
                setSelectedPath(rowItem.path);
                opts.onConfirmSelection(rowItem.path);
            });

            listEl.appendChild(rowEl);
            rowEls.push(rowEl);
        });

        listNav.setIndex(nextIdx, { notify: false, scroll: true });
    };

    const handleArrowKey = (dir: number) => {
        if (currentRows.length === 0) return;
        listNav.move(dir, true);
    };

    const handleHome = () => {
        if (currentRows.length === 0) return;
        listNav.first(true);
    };

    const handleEnd = () => {
        if (currentRows.length === 0) return;
        listNav.last(true);
    };

    const handleEnter = (): boolean => {
        if (currentRows.length === 0) return false;
        const chosen = currentRows[listNav.getIndex()];
        if (!chosen) return false;

        if (activeTab === "computer") {
            if (chosen.type === "up-dir" || chosen.type === "sub-dir") {
                filterInput.value = "";
                void loadComputerDirectory(chosen.path);
                filterInput.focus();
                return true;
            }
        }
        setSelectedPath(chosen.path);
        opts.onConfirmSelection(chosen.path);
        return true;
    };

    const handleBackspace = (): boolean => {
        if (activeTab === "computer" && parentComputerPath) {
            filterInput.value = "";
            void loadComputerDirectory(parentComputerPath);
            filterInput.focus();
            return true;
        }
        return false;
    };

    /**
     * Handler de teclado integrado à camada modal (`pushLayer`).
     * Trata ↑/↓/PgUp/PgDn/Home/End/←/→/Backspace/Enter respeitando botões e inputs internos.
     */
    const handleModalKeyDown = (e: KeyboardEvent): boolean => {
        const active = document.activeElement as HTMLElement | null;

        // Se estiver editando o input inline de nova pasta ou o pathInput, deixa o próprio input tratar Enter/setas horizontais
        if (active && active.classList.contains("tree-inline-input")) {
            return false;
        }
        if (
            active === pathInput &&
            (e.key === "Enter" ||
                e.key === "Backspace" ||
                e.key === "Home" ||
                e.key === "End" ||
                e.key === "ArrowLeft" ||
                e.key === "ArrowRight")
        ) {
            return false;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            handleArrowKey(1);
            return true;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            handleArrowKey(-1);
            return true;
        }
        if (e.key === "PageDown") {
            e.preventDefault();
            e.stopPropagation();
            handleArrowKey(5);
            return true;
        }
        if (e.key === "PageUp") {
            e.preventDefault();
            e.stopPropagation();
            handleArrowKey(-5);
            return true;
        }
        if (e.key === "Home" && active?.tagName !== "INPUT") {
            e.preventDefault();
            e.stopPropagation();
            handleHome();
            return true;
        }
        if (e.key === "End" && active?.tagName !== "INPUT") {
            e.preventDefault();
            e.stopPropagation();
            handleEnd();
            return true;
        }
        // Alternar abas [Workspaces] <-> [Computador] com ←/→ quando o filtro está vazio ou foco nas abas do browser
        if (
            e.key === "ArrowRight" &&
            activeTab === "quick" &&
            ((active === filterInput && filterInput.value === "") ||
                active === tabQuickBtn ||
                active === tabComputerBtn)
        ) {
            e.preventDefault();
            e.stopPropagation();
            switchTab("computer");
            if (active === tabQuickBtn) tabComputerBtn.focus();
            return true;
        }
        if (
            e.key === "ArrowLeft" &&
            activeTab === "computer" &&
            ((active === filterInput && filterInput.value === "") ||
                active === tabQuickBtn ||
                active === tabComputerBtn)
        ) {
            e.preventDefault();
            e.stopPropagation();
            switchTab("quick");
            if (active === tabComputerBtn) tabQuickBtn.focus();
            return true;
        }
        if (e.key === "Backspace") {
            const isTypingInInput =
                active &&
                (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
            const inputVal = (active as HTMLInputElement)?.value;
            if (
                !isTypingInInput ||
                (active === filterInput && inputVal === "")
            ) {
                if (handleBackspace()) {
                    e.preventDefault();
                    e.stopPropagation();
                    return true;
                }
            }
        }
        // Enter: se o foco estiver em um <button> (abas do browser, .ocultos, Nova Pasta, Cancelar/Salvar),
        // NÃO intercepta — deixa o comportamento nativo do botão funcionar (corrige B2!).
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            if (active && active.tagName === "BUTTON") {
                return false;
            }
            if (active === filterInput || active === listEl || active === box) {
                e.preventDefault();
                e.stopPropagation();
                handleEnter();
                return true;
            }
        }
        return false;
    };

    tabQuickBtn.addEventListener("click", () => switchTab("quick"));
    tabComputerBtn.addEventListener("click", () => switchTab("computer"));

    btnToggleHidden.addEventListener("click", () => {
        showHidden = !showHidden;
        btnToggleHidden.classList.toggle("active", showHidden);
        renderRows(0);
    });

    btnNewFolder.addEventListener("click", () => {
        startInlineNewFolder();
    });

    btnUpDir.addEventListener("click", () => {
        if (parentComputerPath) {
            filterInput.value = "";
            void loadComputerDirectory(parentComputerPath);
        }
    });

    pathInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            const val = pathInput.value.trim();
            if (val) {
                filterInput.value = "";
                void loadComputerDirectory(val);
            }
        }
    });

    filterInput.addEventListener("input", () => {
        renderRows(0);
        const first = currentRows[0];
        if (first && first.type !== "up-dir") {
            setSelectedPath(first.path);
        }
    });

    listEl.addEventListener("click", (e) => {
        if (e.target === listEl) {
            filterInput.focus();
        }
    });

    // Initial load
    if (activeTab === "computer") {
        void loadComputerDirectory(currentComputerPath);
    } else {
        const initIdx = opts.quickItems.findIndex(
            (i) => i.path === selectedPath,
        );
        const startIdx = initIdx >= 0 ? initIdx : 0;
        if (opts.quickItems[startIdx]) {
            setSelectedPath(opts.quickItems[startIdx].path);
        }
        renderRows(startIdx);
    }

    return {
        element: box,
        filterInput,
        getSelectedPath: () => selectedPath,
        handleArrowKey,
        handleEnter,
        handleBackspace,
        handleHome,
        handleEnd,
        handleModalKeyDown,
    };
}

function openIntegratedSaveFileModal(tab: OpenTab): Promise<boolean> {
    return new Promise(async (resolve) => {
        let resolved = false;
        const finish = (ok: boolean) => {
            if (resolved) return;
            resolved = true;
            resolve(ok);
        };

        let stdDirs: string[] = [];
        try {
            stdDirs = await GetUserStandardDirectories();
        } catch {
            stdDirs = [];
        }

        const quickItems: QuickDirectoryItem[] = [];
        for (const ws of workspaces) {
            const wsName = getBaseName(ws.root);
            quickItems.push({
                section: `Workspace: ${wsName}`,
                label: `${wsName} / (Raiz)`,
                meta: ws.root,
                path: ws.root,
            });
            try {
                const subdirs = await GetWorkspaceSubdirectories(ws.root);
                if (subdirs) {
                    for (const sub of subdirs) {
                        if (sub === "/") continue;
                        quickItems.push({
                            section: `Workspace: ${wsName}`,
                            label: `${wsName} / ${sub}`,
                            meta: `${ws.root}/${sub}`,
                            path: `${ws.root}/${sub}`,
                        });
                    }
                }
            } catch {
                // ignore
            }
        }

        for (const d of stdDirs) {
            if (workspaces.some((ws) => ws.root === d)) continue;
            quickItems.push({
                section: "Diretórios do Sistema",
                label: getBaseName(d) || d,
                meta: d,
                path: d,
            });
        }

        const activeWs =
            findWorkspaceOfPath(selectedTreePath) || workspaces[0] || null;
        const initialDir = activeWs?.root || stdDirs[0] || "";

        let suggestedName = tab.name;
        if (tab.path.startsWith("untitled:")) {
            const content = tab.state.doc.toString();
            const h1Match = content.match(/^#\s+(.+)$/m);
            if (h1Match) {
                const cleanTitle = h1Match[1]
                    .trim()
                    .replace(/[\\/:*?"<>|]/g, "")
                    .slice(0, 50);
                if (cleanTitle) {
                    suggestedName = `${cleanTitle}.md`;
                }
            }
        }
        if (!suggestedName.endsWith(".md")) {
            suggestedName += ".md";
        }

        let targetDir = initialDir;

        const formEl = document.createElement("div");

        // 1. Filename input
        const nameGroup = document.createElement("div");
        nameGroup.className = "gecko-form-group";
        const nameLabel = document.createElement("label");
        nameLabel.className = "gecko-form-label";
        nameLabel.textContent = "Nome do arquivo (.md)";
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "gecko-form-input";
        nameInput.value = suggestedName;
        nameGroup.appendChild(nameLabel);
        nameGroup.appendChild(nameInput);
        formEl.appendChild(nameGroup);

        // 2. Preview element
        const previewBox = document.createElement("div");
        previewBox.className = "gecko-form-path-preview";
        const previewLabel = document.createElement("span");
        previewLabel.className = "gecko-form-path-preview-label";
        previewLabel.textContent = "Destino:";
        const previewVal = document.createElement("span");
        previewVal.className = "gecko-form-path-preview-value";
        previewBox.appendChild(previewLabel);
        previewBox.appendChild(previewVal);

        const updatePreview = () => {
            let fname = nameInput.value.trim();
            if (!fname) fname = "Sem-titulo.md";
            if (!fname.endsWith(".md")) fname += ".md";
            previewVal.textContent = targetDir
                ? `${targetDir}/${fname}`
                : fname;
        };

        const doSave = async () => {
            let fname = nameInput.value.trim();
            if (!fname) {
                nameInput.classList.add("has-error");
                nameInput.focus();
                return;
            }
            if (fname.includes("/") || fname.includes("\\")) {
                nameInput.classList.add("has-error");
                nameInput.focus();
                showStatusMessage("O nome do arquivo não pode conter barras.");
                return;
            }
            if (!fname.endsWith(".md")) {
                fname += ".md";
            }
            const dir = browser.getSelectedPath() || targetDir;
            if (!dir) {
                showStatusMessage("Selecione uma pasta de destino.");
                return;
            }
            const finalPath = `${dir}/${fname}`;
            closeModal();
            const ok = await finalizeSaveTab(tab, finalPath);
            finish(ok);
        };

        // 3. Integrated Directory Browser
        const browserGroup = document.createElement("div");
        browserGroup.className = "gecko-form-group";
        const browserLabel = document.createElement("label");
        browserLabel.className = "gecko-form-label";
        browserLabel.textContent = "Pasta de destino";
        const browser = createGeckoDirectoryBrowser({
            quickTabLabel:
                workspaces.length > 0
                    ? "Workspaces Ativos"
                    : "Locais do Sistema",
            quickItems,
            initialSelectedPath: initialDir,
            initialComputerPath: initialDir,
            initialTab: "quick",
            onSelectionChange: (dirPath) => {
                targetDir = dirPath;
                updatePreview();
            },
            onConfirmSelection: (dirPath) => {
                targetDir = dirPath;
                updatePreview();
                void doSave();
            },
        });
        browserGroup.appendChild(browserLabel);
        browserGroup.appendChild(browser.element);
        formEl.appendChild(browserGroup);

        // 4. Path preview at bottom
        formEl.appendChild(previewBox);
        updatePreview();

        nameInput.addEventListener("input", () => {
            nameInput.classList.remove("has-error");
            updatePreview();
        });

        openModal(
            "Salvar Arquivo Markdown",
            formEl,
            [
                {
                    label: "Cancelar",
                    className: "action-btn",
                    onClick: () => {
                        closeModal();
                        finish(false);
                    },
                },
                {
                    label: "Salvar",
                    className: "action-btn primary",
                    onClick: () => void doSave(),
                },
            ],
            {
                wide: true,
                initialFocusEl: nameInput,
                onKeyDown: browser.handleModalKeyDown,
                onCancel: () => finish(false),
            },
        );

        queueMicrotask(() => {
            const dotIdx = nameInput.value.lastIndexOf(".md");
            if (dotIdx > 0) {
                nameInput.setSelectionRange(0, dotIdx);
            } else {
                nameInput.select();
            }
        });
    });
}

function openIntegratedWorkspaceModal(
    mode: "open" | "create",
): Promise<string | null> {
    return new Promise(async (resolve) => {
        let resolved = false;
        const finish = (val: string | null) => {
            if (resolved) return;
            resolved = true;
            resolve(val);
        };

        let stdDirs: string[] = [];
        try {
            stdDirs = await GetUserStandardDirectories();
        } catch {
            stdDirs = [];
        }

        const quickItems: QuickDirectoryItem[] = [];
        const seen = new Set<string>();

        if (mode === "open") {
            const recentList = (appSettings.recentWorkspaces || []).filter(
                (r) => !workspaces.some((ws) => ws.root === r),
            );
            for (const r of recentList) {
                if (seen.has(r)) continue;
                seen.add(r);
                quickItems.push({
                    section: "Workspaces Recentes",
                    label: getBaseName(r) || r,
                    meta: r,
                    path: r,
                });
            }
        } else {
            const activeWs =
                findWorkspaceOfPath(selectedTreePath) || workspaces[0];
            if (activeWs) {
                const parentOfActive = getDirName(activeWs.root);
                if (parentOfActive && !seen.has(parentOfActive)) {
                    seen.add(parentOfActive);
                    quickItems.push({
                        section: "Locais Sugeridos",
                        label: getBaseName(parentOfActive) || parentOfActive,
                        meta: parentOfActive,
                        path: parentOfActive,
                    });
                }
            }
        }

        for (const d of stdDirs) {
            if (seen.has(d)) continue;
            seen.add(d);
            quickItems.push({
                section: "Diretórios do Sistema",
                label: getBaseName(d) || d,
                meta: d,
                path: d,
            });
        }

        const initialDir = quickItems[0]?.path || stdDirs[0] || "";
        let selectedDir = initialDir;

        const formEl = document.createElement("div");

        let nameInput: HTMLInputElement | null = null;
        if (mode === "create") {
            const nameGroup = document.createElement("div");
            nameGroup.className = "gecko-form-group";
            const nameLabel = document.createElement("label");
            nameLabel.className = "gecko-form-label";
            nameLabel.textContent = "Nome da nova pasta do workspace";
            nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.className = "gecko-form-input";
            nameInput.placeholder = "ex: meu-novo-projeto";
            nameGroup.appendChild(nameLabel);
            nameGroup.appendChild(nameInput);
            formEl.appendChild(nameGroup);
        }

        const previewBox = document.createElement("div");
        previewBox.className = "gecko-form-path-preview";
        const previewLabel = document.createElement("span");
        previewLabel.className = "gecko-form-path-preview-label";
        previewLabel.textContent =
            mode === "create" ? "Novo Workspace:" : "Workspace:";
        const previewVal = document.createElement("span");
        previewVal.className = "gecko-form-path-preview-value";
        previewBox.appendChild(previewLabel);
        previewBox.appendChild(previewVal);

        const updatePreview = () => {
            if (mode === "create" && nameInput) {
                const fname = nameInput.value.trim() || "<nome-da-pasta>";
                previewVal.textContent = selectedDir
                    ? `${selectedDir}/${fname}`
                    : fname;
            } else {
                previewVal.textContent = selectedDir;
            }
        };

        const doExecute = async () => {
            const targetDir = browser.getSelectedPath() || selectedDir;
            if (!targetDir) return;

            if (mode === "create" && nameInput) {
                const folderName = nameInput.value.trim();
                if (!folderName) {
                    nameInput.classList.add("has-error");
                    nameInput.focus();
                    return;
                }
                try {
                    const createdPath = await CreateWorkspaceAtPath(
                        targetDir,
                        folderName,
                    );
                    if (createdPath) {
                        await addWorkspace(createdPath);
                        showTemporaryStatus(`Workspace criado: ${folderName}`);
                        closeModal();
                        finish(createdPath);
                    }
                } catch (err: any) {
                    nameInput.classList.add("has-error");
                    showStatusMessage(String(err?.message || err));
                }
                return;
            }

            closeModal();
            const added = await addWorkspace(targetDir);
            finish(added);
        };

        const browserGroup = document.createElement("div");
        browserGroup.className = "gecko-form-group";
        if (mode === "create") {
            const browserLabel = document.createElement("label");
            browserLabel.className = "gecko-form-label";
            browserLabel.textContent = "Local pai onde o workspace será criado";
            browserGroup.appendChild(browserLabel);
        }

        const browser = createGeckoDirectoryBrowser({
            quickTabLabel:
                mode === "open" ? "Recentes & Locais" : "Locais Sugeridos",
            quickItems,
            initialSelectedPath: initialDir,
            initialComputerPath: initialDir,
            initialTab: "quick",
            onSelectionChange: (dirPath) => {
                selectedDir = dirPath;
                updatePreview();
            },
            onConfirmSelection: (dirPath) => {
                selectedDir = dirPath;
                updatePreview();
                void doExecute();
            },
        });

        browserGroup.appendChild(browser.element);
        formEl.appendChild(browserGroup);
        formEl.appendChild(previewBox);
        updatePreview();

        if (nameInput) {
            nameInput.addEventListener("input", () => {
                nameInput?.classList.remove("has-error");
                updatePreview();
            });
        }

        openModal(
            mode === "create" ? "Criar Novo Workspace" : "Abrir Workspace",
            formEl,
            [
                {
                    label: "Cancelar",
                    className: "action-btn",
                    onClick: () => {
                        closeModal();
                        finish(null);
                    },
                },
                {
                    label:
                        mode === "create"
                            ? "Criar e Abrir Workspace"
                            : "Abrir Workspace",
                    className: "action-btn primary",
                    onClick: () => void doExecute(),
                },
            ],
            {
                wide: true,
                initialFocusEl: nameInput || browser.filterInput,
                onKeyDown: browser.handleModalKeyDown,
                onCancel: () => finish(null),
            },
        );
    });
}

function openIntegratedCreateWorkspaceModal(): Promise<string | null> {
    return openIntegratedWorkspaceModal("create");
}

function openIntegratedOpenWorkspaceModal(): Promise<string | null> {
    return openIntegratedWorkspaceModal("open");
}

async function saveTab(tabPath: string): Promise<boolean> {
    const tab = openTabs.find((t) => t.path === tabPath);
    if (!tab) return false;

    if (activeTabPath === tab.path && editorView) {
        tab.state = editorView.state;
    }

    if (tab.path.startsWith("untitled:")) {
        return await openIntegratedSaveFileModal(tab);
    }

    return await finalizeSaveTab(tab, tab.path);
}

async function saveActiveTab(): Promise<void> {
    if (!activeTabPath) return;
    await saveTab(activeTabPath);
}

function cycleActiveTab(offset: -1 | 1): void {
    if (openTabs.length === 0) return;
    if (openTabs.length === 1) {
        activateTab(openTabs[0].path, true);
        return;
    }
    const currentIdx = openTabs.findIndex((t) => t.path === activeTabPath);
    const nextIdx =
        currentIdx === -1
            ? 0
            : (currentIdx + offset + openTabs.length) % openTabs.length;
    activateTab(openTabs[nextIdx].path, true);
}

function activateTabByIndex(zeroBasedIndex: number): void {
    if (openTabs.length === 0) return;
    if (zeroBasedIndex === 8) {
        // Ctrl+9 sempre ativa a última aba aberta
        const last = openTabs[openTabs.length - 1];
        if (last) activateTab(last.path, true);
        return;
    }
    if (zeroBasedIndex >= 0 && zeroBasedIndex < openTabs.length) {
        activateTab(openTabs[zeroBasedIndex].path, true);
    }
}

let tabItemEls: HTMLElement[] = [];

const tabBarNav: ListNavigator = createListNavigator({
    container: tabListEl,
    getItems: () => tabItemEls,
    orientation: "horizontal",
    mode: "roving",
    wrap: true,
    selectedClass: "keyboard-focused",
    onActivate: (idx) => {
        const target = openTabs[idx];
        if (target) {
            activateTab(target.path, true);
        }
    },
});

function handleTabBarKeyDown(e: KeyboardEvent): void {
    if (inlineTabRenamePath) return;
    const target = e.target as HTMLElement | null;
    if (target && target.tagName === "INPUT") return;
    if (openTabs.length === 0) return;

    const currentIdx = tabBarNav.getIndex();
    const focusedTab = openTabs[currentIdx];

    if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (editorView && activeTabPath) {
            editorView.focus();
        }
        return;
    }

    if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (focusedTab) {
            activateTab(focusedTab.path, true);
        }
        return;
    }

    if (e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        if (focusedTab) {
            requestCloseTab(focusedTab.path);
        }
        return;
    }

    if (e.key === "F2") {
        e.preventDefault();
        e.stopPropagation();
        if (focusedTab && !focusedTab.path.startsWith("untitled:")) {
            startTabInlineRename(focusedTab.path);
        }
        return;
    }

    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        e.stopPropagation();
        const el = tabItemEls[currentIdx];
        if (focusedTab && el) {
            const rect = el.getBoundingClientRect();
            openTabContextMenu(rect.left + 12, rect.bottom + 2, focusedTab, el);
        }
        return;
    }

    tabBarNav.handleKeyDown(e);
}

// Render Top Tab Bar (Simplified: no pencil icon; double-click or right-click to rename)
function renderTabs(): void {
    const hadTabBarFocus =
        tabListEl.contains(document.activeElement) && !inlineTabRenamePath;
    const prevFocusedPath =
        (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
            ".tab-item",
        )?.dataset.path || activeTabPath;

    tabListEl.innerHTML = "";
    tabItemEls = [];

    for (const tab of openTabs) {
        const isActive = tab.path === activeTabPath;
        const isRenaming = inlineTabRenamePath === tab.path;

        const item = document.createElement("div");
        item.className = `tab-item${isActive ? " active" : ""}`;
        item.dataset.path = tab.path;
        item.setAttribute("role", "tab");
        item.setAttribute("aria-selected", String(isActive));
        item.tabIndex = isActive ? 0 : -1;
        item.title = `${getRelativePath(tab.path)} (Duplo clique ou F2 para renomear)`;

        if (tab.isDirty) {
            const dirtyDot = document.createElement("span");
            dirtyDot.className = "tab-dirty-indicator";
            dirtyDot.textContent = "•";
            dirtyDot.title = "Modificações não salvas";
            item.appendChild(dirtyDot);
        }

        if (isRenaming) {
            const input = document.createElement("input");
            input.type = "text";
            input.className = "tab-inline-input";
            input.value = tab.name;

            let finished = false;
            const commitTabRename = async () => {
                if (finished) return;
                const nextVal = input.value.trim();
                if (!nextVal || nextVal === tab.name) {
                    hideConflictModal();
                    finished = true;
                    inlineTabRenamePath = "";
                    renderTabs();
                    return;
                }

                const owningWs = findWorkspaceOfPath(tab.path);
                const parentDir = getDirName(tab.path);
                if (owningWs) {
                    const conflict = checkSiblingConflict(
                        owningWs.root,
                        parentDir,
                        nextVal,
                        false,
                        tab.path,
                    );
                    if (conflict) {
                        showConflictModal(
                            input,
                            conflict.existingName,
                            conflict.isDir,
                        );
                        shakeConflictModal();
                        input.focus();
                        return;
                    }
                }

                finished = true;
                hideConflictModal();
                inlineTabRenamePath = "";
                try {
                    const newPath = joinPath(
                        parentDir,
                        ensureMdFileName(nextVal),
                    );
                    await relocateEntry(tab.path, newPath, false);
                } catch (err) {
                    const errStr = String(err);
                    if (
                        errStr.includes("já existe") ||
                        errStr.includes("already exists")
                    ) {
                        finished = false;
                        inlineTabRenamePath = tab.path;
                        showConflictModal(input, nextVal, false);
                        shakeConflictModal();
                        input.focus();
                        return;
                    }
                    showStatusMessage(`Erro ao renomear: ${errStr}`);
                    renderTabs();
                }
            };

            const cancelTabRename = () => {
                if (finished) return;
                finished = true;
                hideConflictModal();
                inlineTabRenamePath = "";
                renderTabs();
            };

            input.addEventListener("click", (e) => e.stopPropagation());
            input.addEventListener("keydown", (e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                    e.preventDefault();
                    void commitTabRename();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelTabRename();
                }
            });
            input.addEventListener("input", () => {
                const nextVal = input.value.trim();
                const owningWs = findWorkspaceOfPath(tab.path);
                if (!owningWs || !nextVal || nextVal === tab.name) {
                    hideConflictModal();
                    return;
                }
                const conflict = checkSiblingConflict(
                    owningWs.root,
                    getDirName(tab.path),
                    nextVal,
                    false,
                    tab.path,
                );
                if (conflict) {
                    showConflictModal(
                        input,
                        conflict.existingName,
                        conflict.isDir,
                    );
                } else {
                    hideConflictModal();
                }
            });
            input.addEventListener("blur", () => {
                if (
                    conflictPopoverEl &&
                    conflictPopoverEl.contains(document.activeElement)
                ) {
                    return;
                }
                const nextVal = input.value.trim();
                const owningWs = findWorkspaceOfPath(tab.path);
                if (owningWs && nextVal && nextVal !== tab.name) {
                    const conflict = checkSiblingConflict(
                        owningWs.root,
                        getDirName(tab.path),
                        nextVal,
                        false,
                        tab.path,
                    );
                    if (conflict) {
                        cancelTabRename();
                        return;
                    }
                }
                void commitTabRename();
            });

            item.appendChild(input);

            queueMicrotask(() => {
                input.focus();
                const dotIdx = input.value.lastIndexOf(".");
                if (dotIdx > 0) {
                    input.setSelectionRange(0, dotIdx);
                } else {
                    input.select();
                }
            });
        } else {
            const titleSpan = document.createElement("span");
            titleSpan.className = "tab-title";
            titleSpan.textContent = tab.name;
            titleSpan.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                startTabInlineRename(tab.path);
            });
            item.appendChild(titleSpan);
        }

        const actionsGroup = document.createElement("div");
        actionsGroup.className = "tab-actions";

        // Delete File Button in Tab (tabIndex=-1 so Tab key doesn't accidentally land on destructive action)
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.tabIndex = -1;
        deleteBtn.className = "tab-action-btn delete-btn";
        deleteBtn.title = "Excluir arquivo do disco";
        deleteBtn.setAttribute("aria-label", `Excluir ${tab.name}`);
        deleteBtn.innerHTML =
            '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 4h11M5.5 4V2.5h5V4M4 4v9.5h8V4"/></svg>';
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeContextMenu();
            requestDeleteEntry(tab.path, false);
        });
        actionsGroup.appendChild(deleteBtn);

        // Close Tab Button
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.tabIndex = -1;
        closeBtn.className = "tab-action-btn";
        closeBtn.title = "Fechar aba (Delete)";
        closeBtn.setAttribute("aria-label", `Fechar ${tab.name}`);
        closeBtn.textContent = "×";
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeContextMenu();
            requestCloseTab(tab.path);
        });
        actionsGroup.appendChild(closeBtn);

        item.appendChild(actionsGroup);

        item.addEventListener("click", () => {
            closeContextMenu();
            activateTab(tab.path, true);
        });

        item.addEventListener("auxclick", (e) => {
            if (e.button === 1) {
                e.preventDefault();
                closeContextMenu();
                requestCloseTab(tab.path);
            }
        });

        item.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openTabContextMenu(e.clientX, e.clientY, tab, item);
        });

        tabListEl.appendChild(item);
        tabItemEls.push(item);
    }

    if (openTabs.length > 0) {
        const targetIdx = Math.max(
            0,
            openTabs.findIndex((t) => t.path === prevFocusedPath),
        );
        tabBarNav.setIndex(targetIdx, {
            focus: hadTabBarFocus,
            notify: false,
            scroll: hadTabBarFocus,
        });
    }
}

// Sidebar Drag-and-Drop Handler (Manual Reorder + Move into Folder within a Workspace)
async function handleTreeDrop(
    sourcePath: string,
    sourceIsDir: boolean,
    targetPath: string,
    targetIsDir: boolean,
    position: TreeDropPosition,
): Promise<void> {
    const sourceWs = findWorkspaceOfPath(sourcePath);
    const targetWs = findWorkspaceOfPath(targetPath);
    if (
        !sourceWs ||
        !targetWs ||
        sourceWs.root !== targetWs.root ||
        !sourceWs.tree
    ) {
        return;
    }

    const ws = sourceWs;
    const sourceParent = getDirName(sourcePath);
    const sourceName = getBaseName(sourcePath);

    if (position === "into" && targetIsDir) {
        // Move source into target folder on disk
        if (sourceParent === targetPath) return;
        const destPath = joinPath(targetPath, sourceName);
        expandedDirs.add(targetPath);
        try {
            await relocateEntry(sourcePath, destPath, sourceIsDir);
        } catch (err) {
            showStatusMessage(`Erro ao mover item: ${String(err)}`);
        }
        return;
    }

    const targetParent = getDirName(targetPath);
    const targetName = getBaseName(targetPath);

    // If dropped before/after an item in a DIFFERENT folder, move on disk first
    let effectiveSourceName = sourceName;
    if (sourceParent !== targetParent) {
        const destPath = joinPath(targetParent, sourceName);
        try {
            await relocateEntry(sourcePath, destPath, sourceIsDir);
            effectiveSourceName = getBaseName(destPath);
        } catch (err) {
            showStatusMessage(`Erro ao mover item: ${String(err)}`);
            return;
        }
    }

    // Reorder siblings within targetParent and switch workspace to manual sort mode
    const parentNode = findNodeByPath(ws.tree, targetParent);
    if (!parentNode || !parentNode.children) return;

    const currentSorted = getSortedChildren(
        ws,
        targetParent,
        parentNode.children,
    ).map((c) => c.name);
    const withoutSource = currentSorted.filter(
        (n) => n !== effectiveSourceName,
    );
    const targetIdx = withoutSource.indexOf(targetName);
    if (targetIdx === -1) {
        withoutSource.push(effectiveSourceName);
    } else {
        const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
        withoutSource.splice(insertIdx, 0, effectiveSourceName);
    }

    setManualOrderList(ws.root, targetParent, withoutSource);
    const switchedToManual = ws.sortMode !== "manual";
    ws.sortMode = "manual";

    await persistAppSettings();
    renderWorkspaceSectionInPlace(ws.root);
    if (switchedToManual) {
        showStatusMessage(
            `Ordenação de ${ws.tree?.name || getBaseName(ws.root)} alterada para Manual`,
        );
    }
}

// Context Menus & Sort Menu
interface ContextMenuOption {
    label?: string;
    active?: boolean;
    danger?: boolean;
    separator?: boolean;
    action?: () => void;
}

let activeContextMenuLayer: ActiveLayer | null = null;

function showContextMenu(
    x: number,
    y: number,
    options: ContextMenuOption[],
    originEl?: HTMLElement | null,
    focusFirstItem = false,
): void {
    contextMenuEl.innerHTML = "";
    contextMenuEl.tabIndex = -1;
    const itemButtons: HTMLButtonElement[] = [];

    for (const opt of options) {
        if (opt.separator) {
            const sep = document.createElement("div");
            sep.className = "context-menu-sep";
            sep.setAttribute("role", "separator");
            contextMenuEl.appendChild(sep);
            continue;
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("role", "menuitem");
        btn.className = `context-menu-item${opt.danger ? " danger" : ""}${
            opt.active ? " active-option" : ""
        }`;

        const labelSpan = document.createElement("span");
        labelSpan.textContent = opt.label || "";
        btn.appendChild(labelSpan);

        if (opt.active) {
            const checkSpan = document.createElement("span");
            checkSpan.textContent = "✓";
            btn.appendChild(checkSpan);
        }

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeContextMenu(true);
            if (opt.action) opt.action();
        });

        // Hover do mouse sincroniza o item ativo dinamicamente sem travar seleção
        btn.addEventListener("mouseenter", () => {
            const btnIdx = itemButtons.indexOf(btn);
            if (btnIdx !== -1) {
                menuNav.setIndex(btnIdx, {
                    focus: false,
                    notify: false,
                    scroll: false,
                });
            }
        });

        contextMenuEl.appendChild(btn);
        itemButtons.push(btn);
    }

    contextMenuEl.classList.remove("hidden");

    const rect = contextMenuEl.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    contextMenuEl.style.left = `${Math.max(4, clampedX)}px`;
    contextMenuEl.style.top = `${Math.max(4, clampedY)}px`;

    const menuNav = createListNavigator({
        container: contextMenuEl,
        getItems: () => itemButtons,
        orientation: "vertical",
        mode: "roving",
        wrap: true,
        typeAhead: true,
        onActivate: (_idx, el) => {
            el?.click();
        },
    });

    // Ao retirar o ponteiro do menu, desmarca qualquer item selecionado
    contextMenuEl.onmouseleave = () => {
        menuNav.clearSelection();
    };

    if (focusFirstItem) {
        menuNav.first(true);
    } else {
        menuNav.clearSelection();
    }

    activeContextMenuLayer = pushLayer({
        id: "context-menu",
        element: contextMenuEl,
        kind: "popup",
        initialFocus: () =>
            focusFirstItem
                ? itemButtons[menuNav.getIndex()] || itemButtons[0] || contextMenuEl
                : contextMenuEl,
        restoreFocusTo:
            originEl ?? (document.activeElement as HTMLElement | null),
        onEscape: () => {
            closeContextMenu(true);
        },
        closeOnTab: () => {
            closeContextMenu(true);
        },
        onKeyDown: (e) => {
            if (e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                menuNav.activateCurrent(e);
                return true;
            }
            return menuNav.handleKeyDown(e);
        },
    });
}

function closeContextMenu(restoreFocus = false): void {
    contextMenuEl.classList.add("hidden");
    if (activeContextMenuLayer) {
        const layer = activeContextMenuLayer;
        activeContextMenuLayer = null;
        layer.close({ restoreFocus });
    }
}

function openSortMenu(wsRoot: string, anchorEl: HTMLElement): void {
    const ws = findWorkspaceByRoot(wsRoot);
    if (!ws) return;

    const rect = anchorEl.getBoundingClientRect();
    const wsName = ws.tree?.name || getBaseName(ws.root);

    const applySort = (mode: SortMode, dir: SortDirection, label: string) => {
        ws.sortMode = mode;
        ws.sortDir = dir;
        void persistAppSettings();
        renderWorkspaceSectionInPlace(ws.root);
        showStatusMessage(`Ordenação (${wsName}): ${label}`);
    };

    showContextMenu(rect.left, rect.bottom + 4, [
        {
            label: "Nome (Alfabética)",
            active: ws.sortMode === "name",
            action: () => applySort("name", ws.sortDir, "Nome"),
        },
        {
            label: "Data de Modificação",
            active: ws.sortMode === "modTime",
            action: () =>
                applySort("modTime", ws.sortDir, "Data de Modificação"),
        },
        {
            label: "Data de Criação",
            active: ws.sortMode === "birthTime",
            action: () => applySort("birthTime", ws.sortDir, "Data de Criação"),
        },
        {
            label: "Ordem Manual (Arrastar)",
            active: ws.sortMode === "manual",
            action: () => applySort("manual", ws.sortDir, "Ordem Manual"),
        },
        { separator: true },
        {
            label: "Ordem Crescente (↑)",
            active: ws.sortMode !== "manual" && ws.sortDir === "asc",
            action: () =>
                applySort(
                    ws.sortMode === "manual" ? "name" : ws.sortMode,
                    "asc",
                    "Crescente",
                ),
        },
        {
            label: "Ordem Decrescente (↓)",
            active: ws.sortMode !== "manual" && ws.sortDir === "desc",
            action: () =>
                applySort(
                    ws.sortMode === "manual" ? "name" : ws.sortMode,
                    "desc",
                    "Decrescente",
                ),
        },
    ]);
}

function openTreeContextMenu(x: number, y: number, node: main.FileNode): void {
    if (node.isDir) {
        showContextMenu(x, y, [
            {
                label: "Novo Arquivo .md",
                action: () => void startCreateEntry(false, node.path),
            },
            {
                label: "Nova Pasta",
                action: () => void startCreateEntry(true, node.path),
            },
            { separator: true },
            {
                label: "Renomear Pasta (F2)",
                action: () => startTreeRename(node.path, true),
            },
            {
                label: "Excluir Pasta (Delete)",
                danger: true,
                action: () => requestDeleteEntry(node.path, true),
            },
        ]);
    } else {
        showContextMenu(x, y, [
            {
                label: "Abrir Arquivo",
                action: () => void openFileInTab(node.path, true),
            },
            { separator: true },
            {
                label: "Renomear Arquivo (F2)",
                action: () => startTreeRename(node.path, false),
            },
            {
                label: "Excluir Arquivo (Delete)",
                danger: true,
                action: () => requestDeleteEntry(node.path, false),
            },
        ]);
    }
}

function openTabContextMenu(
    x: number,
    y: number,
    tab: OpenTab,
    originEl?: HTMLElement | null,
): void {
    const idx = openTabs.findIndex((t) => t.path === tab.path);
    showContextMenu(
        x,
        y,
        [
            {
                label: "Salvar (Ctrl+S)",
                action: () => void saveTab(tab.path),
            },
            {
                label: "Salvar Como... (Ctrl+Shift+S)",
                action: () => void openIntegratedSaveFileModal(tab),
            },
            {
                label: "Renomear Arquivo (F2)",
                action: () => startTabInlineRename(tab.path),
            },
            {
                label: "Excluir Arquivo",
                danger: true,
                action: () => requestDeleteEntry(tab.path, false),
            },
            { separator: true },
            {
                label: "Mover Aba para Esquerda",
                action: () => {
                    if (idx > 0) {
                        const [moved] = openTabs.splice(idx, 1);
                        openTabs.splice(idx - 1, 0, moved);
                        renderTabs();
                    }
                },
            },
            {
                label: "Mover Aba para Direita",
                action: () => {
                    if (idx >= 0 && idx < openTabs.length - 1) {
                        const [moved] = openTabs.splice(idx, 1);
                        openTabs.splice(idx + 1, 0, moved);
                        renderTabs();
                    }
                },
            },
            { separator: true },
            {
                label: "Fechar Aba (Delete / Ctrl+W)",
                action: () => requestCloseTab(tab.path),
            },
            {
                label: "Fechar Outras Abas",
                action: () => {
                    const others = openTabs
                        .filter((t) => t.path !== tab.path && !t.isDirty)
                        .map((t) => t.path);
                    for (const p of others) {
                        forceCloseTab(p);
                    }
                },
            },
        ],
        originEl,
    );
}

// Modal Helper
interface ModalAction {
    label: string;
    className: string;
    autoFocus?: boolean;
    onClick: () => void;
}

interface ModalOptions {
    wide?: boolean;
    initialFocusEl?: HTMLElement;
    customActionsEl?: HTMLElement;
    onKeyDown?: (e: KeyboardEvent) => boolean | void;
    bindings?: KeyBinding[];
    onCancel?: () => void;
}

let activeModalLayer: ActiveLayer | null = null;
let modalCancelCallback: (() => void) | null = null;
let lastKnownNonModalFocusEl: HTMLElement | null = null;

function restoreDefaultWorkbenchFocus(): void {
    if (
        editorView &&
        activeTabPath &&
        !editorContainerEl.classList.contains("hidden")
    ) {
        editorView.focus();
        return;
    }
    if (!workbenchEl.classList.contains("sidebar-collapsed")) {
        fileTreeEl.focus();
        return;
    }
    emptyBtnOpenFolder?.focus();
}

function openModal(
    title: string,
    body: string | HTMLElement,
    actions: ModalAction[],
    options?: ModalOptions,
): void {
    const currentActive = document.activeElement as HTMLElement | null;
    if (currentActive && !modalOverlayEl.contains(currentActive)) {
        lastKnownNonModalFocusEl = currentActive;
    }
    modalCancelCallback = options?.onCancel || null;
    modalTitleEl.textContent = title;
    modalBodyEl.innerHTML = "";
    if (typeof body === "string") {
        modalBodyEl.textContent = body;
    } else {
        modalBodyEl.appendChild(body);
    }

    const panelEl = modalOverlayEl.querySelector(
        ".modal-panel",
    ) as HTMLElement | null;
    if (panelEl) {
        if (options?.wide) {
            panelEl.classList.add("wide");
        } else {
            panelEl.classList.remove("wide");
        }
        panelEl.classList.remove("shortcuts-wide");
    }

    modalActionsEl.innerHTML = "";
    if (options?.customActionsEl) {
        modalActionsEl.appendChild(options.customActionsEl);
    } else {
        let focusBtn: HTMLButtonElement | null = null;
        for (const act of actions) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = act.className;
            btn.textContent = act.label;
            btn.addEventListener("click", act.onClick);
            modalActionsEl.appendChild(btn);
            if (act.autoFocus || !focusBtn) {
                focusBtn = btn;
            }
        }
        if (!options?.initialFocusEl && focusBtn) {
            options = { ...options, initialFocusEl: focusBtn };
        }
    }

    modalOverlayEl.classList.remove("hidden");

    activeModalLayer = pushLayer({
        id: "modal",
        element: panelEl || modalOverlayEl,
        kind: "modal",
        initialFocus: options?.initialFocusEl ?? null,
        restoreFocusTo: lastKnownNonModalFocusEl,
        restoreFallback: restoreDefaultWorkbenchFocus,
        bindings: options?.bindings,
        onEscape: () => {
            closeModal(true);
        },
        onKeyDown: (e) => {
            if (options?.onKeyDown && options.onKeyDown(e) === true) {
                return true;
            }

            const active = document.activeElement as HTMLElement | null;

            // Enter em inputs de texto comuns, sliders customizados ou Ctrl+Enter aciona o botão primário
            if (e.key === "Enter") {
                const isModEnter = e.ctrlKey || e.metaKey;
                if (
                    isModEnter ||
                    (active &&
                        (active.tagName === "INPUT" ||
                            active.getAttribute("role") === "slider") &&
                        active.dataset.customEnter !== "true")
                ) {
                    const primaryBtn =
                        modalOverlayEl.querySelector<HTMLButtonElement>(
                            "button.action-btn.primary, button.primary",
                        );
                    if (primaryBtn) {
                        e.preventDefault();
                        e.stopPropagation();
                        primaryBtn.click();
                        return true;
                    }
                }
            }

            // Setas ←/→ entre os botões de ação do rodapé do modal
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                const modalBtns = Array.from(
                    modalActionsEl.querySelectorAll<HTMLButtonElement>(
                        "button:not([disabled])",
                    ),
                );
                const activeIdx = modalBtns.indexOf(
                    active as HTMLButtonElement,
                );
                if (activeIdx !== -1 && modalBtns.length > 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    const nextIdx =
                        e.key === "ArrowLeft"
                            ? activeIdx <= 0
                                ? modalBtns.length - 1
                                : activeIdx - 1
                            : activeIdx >= modalBtns.length - 1
                              ? 0
                              : activeIdx + 1;
                    modalBtns[nextIdx].focus();
                    return true;
                }
            }

            return false;
        },
    });
}

function closeModal(fromCancel = false): void {
    modalOverlayEl.classList.add("hidden");
    const panelEl = modalOverlayEl.querySelector(
        ".modal-panel",
    ) as HTMLElement | null;
    if (panelEl) {
        panelEl.classList.remove("wide");
        panelEl.classList.remove("shortcuts-wide");
    }
    const cancelCb = modalCancelCallback;
    modalCancelCallback = null;
    if (activeModalLayer) {
        const layer = activeModalLayer;
        activeModalLayer = null;
        layer.close({ restoreFocus: true });
    }
    if (fromCancel && cancelCb) {
        cancelCb();
    }
}

// Menu Principal do Gecko (Logo + "Gecko") & Modais de Atalhos e Cores
function openGeckoShortcutsModal(): void {
    const controller = createShortcutsModal(() => {
        closeModal(true);
    });

    openModal("Atalhos de Teclado", controller.bodyEl, [], {
        wide: true,
        customActionsEl: controller.actionsEl,
        initialFocusEl: controller.initialFocusEl,
    });

    const panelEl = modalOverlayEl.querySelector(
        ".modal-panel",
    ) as HTMLElement | null;
    if (panelEl) {
        panelEl.classList.add("shortcuts-wide");
    }
}

function openPrimaryColorModal(): void {
    const previousColor =
        normalizeHex(appSettings.accentColor || "") ||
        DEFAULT_GECKO_BRAND_COLOR;

    const controller = createColorConfigModal({
        initialColor: previousColor,
        onConfirm: (chosenHex) => {
            appSettings.accentColor = chosenHex;
            applyGeckoThemeColor(chosenHex);
            void persistAppSettings();
            closeModal(false);
            showTemporaryStatus(`Cor principal atualizada: ${chosenHex}`);
        },
        onCancel: () => {
            closeModal(true);
        },
    });

    openModal("Configurar Cores", controller.bodyEl, [], {
        wide: true,
        customActionsEl: controller.actionsEl,
        initialFocusEl: controller.initialFocusEl,
        onCancel: () => {
            applyGeckoThemeColor(previousColor);
        },
    });
}

function openGeckoBrandMenu(anchorEl: HTMLElement, focusFirstItem = false): void {
    if (!contextMenuEl.classList.contains("hidden")) {
        closeContextMenu(true);
        return;
    }
    workbenchEl.classList.remove("sidebar-collapsed");
    const rect = anchorEl.getBoundingClientRect();
    showContextMenu(
        rect.left,
        rect.bottom + 4,
        [
            {
                label: "Atalhos de Teclado (F1)",
                action: () => {
                    openGeckoShortcutsModal();
                },
            },
            {
                label: "Modo Foco / Zen (F11)",
                action: () => {
                    toggleZenMode();
                },
            },
            {
                label: "Configuração de Cores (Ctrl+,)",
                action: () => {
                    openPrimaryColorModal();
                },
            },
        ],
        anchorEl,
        focusFirstItem,
    );
}

// Window Controls & Safe Application Quit
async function syncWindowMaximizedState(): Promise<void> {
    try {
        const isMax = await WindowIsMaximised();
        workbenchEl.classList.toggle("window-maximized", isMax);
        iconWinMaximize.innerHTML = isMax
            ? '<rect x="2.5" y="1" width="6.5" height="6.5" /><rect x="1" y="2.5" width="6.5" height="6.5" fill="var(--bg-workbench)" />'
            : '<rect x="1.5" y="1.5" width="7" height="7" />';
    } catch {
        // Ignore outside Wails desktop runtime
    }
}

async function handleToggleMaximize(): Promise<void> {
    try {
        WindowToggleMaximise();
        setTimeout(() => void syncWindowMaximizedState(), 60);
    } catch {
        // Ignore outside Wails desktop runtime
    }
}

function requestQuitApp(): void {
    if (activeTabPath && editorView) {
        const activeTab = openTabs.find((t) => t.path === activeTabPath);
        if (activeTab) {
            activeTab.state = editorView.state;
        }
    }
    const dirtyTabs = openTabs.filter(
        (t) =>
            t.isDirty &&
            !(t.path.startsWith("untitled:") && t.state.doc.length === 0),
    );
    if (dirtyTabs.length === 0) {
        void ForceQuit();
        return;
    }

    const fileNames = dirtyTabs.map((t) => t.name).join(", ");
    openModal(
        "Alterações Não Salvas ao Sair",
        `Você possui modificações pendentes em: ${fileNames}. Deseja salvar antes de fechar o Gecko?`,
        [
            {
                label: "Cancelar",
                className: "action-btn",
                autoFocus: true,
                onClick: () => closeModal(),
            },
            {
                label: "Descartar e Sair",
                className: "action-btn danger",
                onClick: () => {
                    closeModal();
                    void ForceQuit();
                },
            },
            {
                label: "Salvar Tudo e Sair",
                className: "action-btn primary",
                onClick: async () => {
                    closeModal();
                    for (const t of dirtyTabs) {
                        const ok = await saveTab(t.path);
                        if (!ok) return;
                    }
                    void ForceQuit();
                },
            },
        ],
    );
}

// Quick Open Fuzzy Finder (Ctrl+P across all open workspaces)
function collectWorkspaceMarkdownFiles(
    ws: WorkspaceEntry,
    node: main.FileNode | null,
    acc: FlatFileItem[],
): void {
    if (!node) return;
    if (!node.isDir) {
        acc.push({
            name: node.name,
            path: node.path,
            relativePath: getRelativePath(node.path),
        });
        return;
    }
    if (node.children) {
        const sorted = getSortedChildren(ws, node.path, node.children);
        for (const child of sorted) {
            collectWorkspaceMarkdownFiles(ws, child, acc);
        }
    }
}

function collectAllMarkdownFiles(): FlatFileItem[] {
    const acc: FlatFileItem[] = [];
    for (const ws of workspaces) {
        collectWorkspaceMarkdownFiles(ws, ws.tree, acc);
    }
    return acc;
}

function fuzzyScore(query: string, target: string): number {
    if (!query) return 1;
    const q = query.toLowerCase();
    const t = target.toLowerCase();

    if (t === q) return 1000;
    if (t.startsWith(q)) return 500 - t.length;
    const subIdx = t.indexOf(q);
    if (subIdx >= 0) return 300 - subIdx * 2;

    let qIdx = 0;
    let score = 0;
    let consecutive = 0;

    for (let i = 0; i < t.length && qIdx < q.length; i++) {
        if (t[i] === q[qIdx]) {
            qIdx++;
            consecutive++;
            score += 10 + consecutive * 5;
        } else {
            consecutive = 0;
        }
    }

    return qIdx === q.length ? score : -1;
}

let activeQuickOpenLayer: ActiveLayer | null = null;
let quickOpenItemEls: HTMLElement[] = [];

const quickOpenNav: ListNavigator = createListNavigator({
    container: quickOpenResultsEl,
    getItems: () => quickOpenItemEls,
    orientation: "vertical",
    mode: "virtual",
    wrap: true,
    pageSize: 6,
    onSelect: (idx) => {
        quickOpenSelectedIndex = idx;
    },
    onActivate: (idx) => {
        const chosen = quickOpenFiltered[idx];
        if (chosen) {
            closeQuickOpen(false);
            void openFileInTab(chosen.path, true);
        }
    },
});

function openQuickOpen(): void {
    if (workspaces.length === 0) {
        showStatusMessage(
            "Abra um workspace primeiro para buscar arquivos (Ctrl+P).",
        );
        return;
    }
    const origin = document.activeElement as HTMLElement | null;
    quickOpenVisible = true;
    quickOpenOverlayEl.classList.remove("hidden");
    quickOpenInputEl.value = "";
    updateQuickOpenList("");

    const panelEl =
        quickOpenOverlayEl.querySelector<HTMLElement>(".quick-open-panel") ||
        quickOpenOverlayEl;

    activeQuickOpenLayer = pushLayer({
        id: "quick-open",
        element: panelEl,
        kind: "modal",
        initialFocus: quickOpenInputEl,
        restoreFocusTo: origin,
        restoreFallback: restoreDefaultWorkbenchFocus,
        onEscape: () => {
            closeQuickOpen(true);
        },
        onKeyDown: (e) => {
            return quickOpenNav.handleKeyDown(e);
        },
    });
}

function closeQuickOpen(restoreFocus = true): void {
    quickOpenVisible = false;
    quickOpenOverlayEl.classList.add("hidden");
    if (activeQuickOpenLayer) {
        const layer = activeQuickOpenLayer;
        activeQuickOpenLayer = null;
        layer.close({ restoreFocus });
    } else if (restoreFocus && editorView && activeTabPath) {
        editorView.focus();
    }
}

function updateQuickOpenList(query: string): void {
    const allFiles = collectAllMarkdownFiles();
    const trimmed = query.trim();

    if (!trimmed) {
        quickOpenFiltered = allFiles.slice(0, 50);
    } else {
        quickOpenFiltered = allFiles
            .map((item) => ({
                item,
                score: Math.max(
                    fuzzyScore(trimmed, item.name) * 2,
                    fuzzyScore(trimmed, item.relativePath),
                ),
            }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 50)
            .map((entry) => entry.item);
    }

    quickOpenSelectedIndex = 0;
    renderQuickOpenItems();
}

function renderQuickOpenItems(): void {
    quickOpenResultsEl.innerHTML = "";
    quickOpenItemEls = [];

    if (quickOpenFiltered.length === 0) {
        const emptyLi = document.createElement("li");
        emptyLi.className = "quick-open-item";
        emptyLi.innerHTML =
            '<span class="quick-open-path">Nenhum arquivo .md encontrado</span>';
        quickOpenResultsEl.appendChild(emptyLi);
        return;
    }

    quickOpenFiltered.forEach((item, idx) => {
        const li = document.createElement("li");
        li.className = `quick-open-item${
            idx === quickOpenSelectedIndex ? " selected" : ""
        }`;
        li.setAttribute("role", "option");
        li.setAttribute(
            "aria-selected",
            String(idx === quickOpenSelectedIndex),
        );

        const nameSpan = document.createElement("span");
        nameSpan.className = "quick-open-name";
        nameSpan.textContent = item.name;

        const pathSpan = document.createElement("span");
        pathSpan.className = "quick-open-path";
        pathSpan.textContent = item.relativePath;

        li.appendChild(nameSpan);
        li.appendChild(pathSpan);

        li.addEventListener("click", () => {
            closeQuickOpen(false);
            void openFileInTab(item.path, true);
        });

        quickOpenResultsEl.appendChild(li);
        quickOpenItemEls.push(li);
    });

    quickOpenNav.setIndex(quickOpenSelectedIndex, {
        focus: false,
        notify: false,
        scroll: true,
    });
}

// Toggle Sidebar Visibility (Ctrl+\)
// Sidebar Resize
function clampSidebarWidth(w: number): number {
    const maxByWindow = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - 320),
    );
    return Math.round(Math.min(Math.max(w, SIDEBAR_MIN_WIDTH), maxByWindow));
}

function applySidebarWidth(w: number): number {
    const width = clampSidebarWidth(w);
    workbenchEl.style.setProperty("--sidebar-width", `${width}px`);
    sidebarResizerEl.setAttribute("aria-valuenow", String(width));
    return width;
}

function commitSidebarWidth(w: number): void {
    appSettings.sidebarWidth = applySidebarWidth(w);
    void persistAppSettings();
}

function bindSidebarResizer(): void {
    sidebarResizerEl.setAttribute("aria-valuemin", String(SIDEBAR_MIN_WIDTH));
    sidebarResizerEl.setAttribute("aria-valuemax", String(SIDEBAR_MAX_WIDTH));

    let startX = 0;
    let startWidth = 0;
    let pendingWidth = 0;
    let rafId = 0;

    const onMove = (e: PointerEvent) => {
        pendingWidth = startWidth + (e.clientX - startX);
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            applySidebarWidth(pendingWidth);
        });
    };

    const onUp = (e: PointerEvent) => {
        sidebarResizerEl.releasePointerCapture(e.pointerId);
        sidebarResizerEl.removeEventListener("pointermove", onMove);
        sidebarResizerEl.removeEventListener("pointerup", onUp);
        sidebarResizerEl.removeEventListener("pointercancel", onUp);
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        document.body.classList.remove("is-resizing-sidebar");
        sidebarResizerEl.classList.remove("active");
        commitSidebarWidth(pendingWidth);
    };

    sidebarResizerEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        startX = e.clientX;
        startWidth = sidebarEl.getBoundingClientRect().width;
        pendingWidth = startWidth;
        sidebarResizerEl.setPointerCapture(e.pointerId);
        document.body.classList.add("is-resizing-sidebar");
        sidebarResizerEl.classList.add("active");
        sidebarResizerEl.addEventListener("pointermove", onMove);
        sidebarResizerEl.addEventListener("pointerup", onUp);
        sidebarResizerEl.addEventListener("pointercancel", onUp);
    });

    // Double-click restores the default width (common convention)
    sidebarResizerEl.addEventListener("dblclick", () => {
        commitSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    });

    // Keyboard accessibility: arrows resize, Home resets
    sidebarResizerEl.addEventListener("keydown", (e) => {
        const current = sidebarEl.getBoundingClientRect().width;
        const step = e.shiftKey ? 40 : 10;
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            commitSidebarWidth(current - step);
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            commitSidebarWidth(current + step);
        } else if (e.key === "Home") {
            e.preventDefault();
            commitSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
        }
    });

    window.addEventListener("resize", () => {
        applySidebarWidth(appSettings.sidebarWidth ?? SIDEBAR_DEFAULT_WIDTH);
    });
}

function toggleSidebar(): void {
    workbenchEl.classList.toggle("sidebar-collapsed");
}

// Modo Foco / Zen
let isZenMode = false;
let preZenSidebarCollapsed = false;

function toggleZenMode(): void {
    if (isZenMode) {
        exitZenMode();
    } else {
        enterZenMode();
    }
}

function enterZenMode(): void {
    if (isZenMode) return;
    isZenMode = true;
    preZenSidebarCollapsed = workbenchEl.classList.contains("sidebar-collapsed");
    workbenchEl.classList.add("zen-mode");
    if (editorView && activeTabPath) {
        editorView.requestMeasure();
        editorView.focus();
    }
    showTemporaryStatus("Modo Zen ativado (Pressione Escape ou F11 para sair)");
}

function exitZenMode(): void {
    if (!isZenMode) return;
    isZenMode = false;
    workbenchEl.classList.remove("zen-mode");
    if (preZenSidebarCollapsed) {
        workbenchEl.classList.add("sidebar-collapsed");
    } else {
        workbenchEl.classList.remove("sidebar-collapsed");
    }
    if (editorView && activeTabPath) {
        editorView.requestMeasure();
        editorView.focus();
    }
    showTemporaryStatus("Modo Zen desativado");
}

// Toggle Line Ending (LF <-> CRLF)
function toggleActiveLineEnding(): void {
    const activeTab = openTabs.find((t) => t.path === activeTabPath);
    if (!activeTab) return;

    activeTab.lineEnding = activeTab.lineEnding === "LF" ? "CRLF" : "LF";
    activeTab.isDirty = true;
    renderTabs();
    syncDirtyStateWithBackend();
    updateStatusBar();
}

// Handle Debounced Filesystem Events from Go Backend (workspace:fs-event)
async function handleFilesystemEvent(payload: {
    root?: string;
    path: string;
    op: string;
}): Promise<void> {
    if (workspaces.length === 0) return;

    const affectedRoot =
        payload.root || findWorkspaceOfPath(payload.path)?.root;
    if (!affectedRoot) return;

    await refreshWorkspaceTree(affectedRoot, false);

    const matchingTab = openTabs.find((t) => t.path === payload.path);
    if (!matchingTab) return;

    const lastSaveTs = recentSelfSaves.get(matchingTab.path) || 0;
    if (Date.now() - lastSaveTs < 800) {
        return;
    }

    if (matchingTab.isDirty) {
        return;
    }

    try {
        const updatedDoc = await ReadFile(matchingTab.path);
        const currentText =
            activeTabPath === matchingTab.path && editorView
                ? editorView.state.doc.toString()
                : matchingTab.state.doc.toString();

        if (updatedDoc.content !== currentText) {
            matchingTab.savedContent = updatedDoc.content;
            matchingTab.lineEnding =
                updatedDoc.lineEnding === "CRLF" ? "CRLF" : "LF";

            if (activeTabPath === matchingTab.path && editorView) {
                const curPos = Math.min(
                    editorView.state.selection.main.head,
                    updatedDoc.content.length,
                );
                editorView.dispatch({
                    changes: {
                        from: 0,
                        to: editorView.state.doc.length,
                        insert: updatedDoc.content,
                    },
                    selection: EditorSelection.cursor(curPos),
                });
                matchingTab.state = editorView.state;
                matchingTab.isDirty = false;
                renderTabs();
                syncDirtyStateWithBackend();
                updateStatusBar();
            } else {
                matchingTab.state = buildEditorStateForTab(
                    matchingTab.path,
                    updatedDoc.content,
                );
                matchingTab.isDirty = false;
                renderTabs();
                syncDirtyStateWithBackend();
            }
        }
    } catch {
        matchingTab.isDirty = true;
        renderTabs();
        syncDirtyStateWithBackend();
    }
}

// Sidebar Keyboard Navigation & F2 / Delete / Backspace / ContextMenu / Type-ahead Shortcuts
let sidebarTypeAheadBuffer = "";
let sidebarTypeAheadTimer: ReturnType<typeof setTimeout> | null = null;

function openSelectedSidebarNodeContextMenu(): void {
    if (!selectedTreePath) return;
    const rowEl = fileTreeEl.querySelector<HTMLElement>(
        `.tree-row[data-path="${CSS.escape(selectedTreePath)}"]`,
    );
    const rect = rowEl
        ? rowEl.getBoundingClientRect()
        : fileTreeEl.getBoundingClientRect();
    const x = rect.left + 24;
    const y = rect.bottom;

    if (isWorkspaceRoot(selectedTreePath)) {
        const wsRoot = selectedTreePath;
        showContextMenu(
            x,
            y,
            [
                {
                    label: "Novo Arquivo .md",
                    action: () => void startCreateEntry(false, wsRoot),
                },
                {
                    label: "Nova Pasta",
                    action: () => void startCreateEntry(true, wsRoot),
                },
                { separator: true },
                {
                    label: "Ordenar Arquivos...",
                    action: () => openSortMenu(wsRoot, rowEl || fileTreeEl),
                },
                {
                    label: "Atualizar Workspace",
                    action: () => void refreshWorkspaceTree(wsRoot, true),
                },
                { separator: true },
                {
                    label: "Remover Workspace",
                    danger: true,
                    action: () => requestRemoveWorkspace(wsRoot),
                },
            ],
            fileTreeEl,
        );
        return;
    }

    const ws = findWorkspaceOfPath(selectedTreePath);
    const node = ws?.tree ? findNodeByPath(ws.tree, selectedTreePath) : null;
    if (node) {
        openTreeContextMenu(x, y, node);
    }
}

function handleSidebarKeyDown(e: KeyboardEvent): void {
    if (inlineTreeState) return;
    const target = e.target as HTMLElement | null;
    if (target && target.tagName === "INPUT") return;

    if (e.key === "Escape") {
        e.preventDefault();
        if (editorView && activeTabPath) {
            editorView.focus();
        }
        return;
    }

    if (workspaces.length === 0 || visibleTreeNodes.length === 0) return;

    const currentIdx = visibleTreeNodes.findIndex(
        (n) => n.path === selectedTreePath,
    );

    if (e.key === "F2") {
        e.preventDefault();
        if (selectedTreePath && !isWorkspaceRoot(selectedTreePath)) {
            startTreeRename(selectedTreePath, selectedTreeIsDir);
        }
        return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedTreePath && !isWorkspaceRoot(selectedTreePath)) {
            requestDeleteEntry(selectedTreePath, selectedTreeIsDir);
        }
        return;
    }

    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        openSelectedSidebarNodeContextMenu();
        return;
    }

    if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx =
            currentIdx < 0
                ? 0
                : Math.min(visibleTreeNodes.length - 1, currentIdx + 1);
        const nextNode = visibleTreeNodes[nextIdx];
        if (nextNode) {
            selectTreeNodeIncrementally(nextNode);
        }
        return;
    }

    if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
        const prevNode = visibleTreeNodes[prevIdx];
        if (prevNode) {
            selectTreeNodeIncrementally(prevNode);
        }
        return;
    }

    if (e.key === "PageDown") {
        e.preventDefault();
        const nextIdx =
            currentIdx < 0
                ? 0
                : Math.min(visibleTreeNodes.length - 1, currentIdx + 8);
        const nextNode = visibleTreeNodes[nextIdx];
        if (nextNode) {
            selectTreeNodeIncrementally(nextNode);
        }
        return;
    }

    if (e.key === "PageUp") {
        e.preventDefault();
        const prevIdx = currentIdx <= 0 ? 0 : Math.max(0, currentIdx - 8);
        const prevNode = visibleTreeNodes[prevIdx];
        if (prevNode) {
            selectTreeNodeIncrementally(prevNode);
        }
        return;
    }

    if (e.key === "Home") {
        e.preventDefault();
        const firstNode = visibleTreeNodes[0];
        if (firstNode) {
            selectTreeNodeIncrementally(firstNode);
        }
        return;
    }

    if (e.key === "End") {
        e.preventDefault();
        const lastNode = visibleTreeNodes[visibleTreeNodes.length - 1];
        if (lastNode) {
            selectTreeNodeIncrementally(lastNode);
        }
        return;
    }

    if (e.key === "ArrowRight") {
        e.preventDefault();
        if (selectedTreeIsDir && selectedTreePath) {
            if (!expandedDirs.has(selectedTreePath)) {
                expandedDirs.add(selectedTreePath);
                renderFileTree();
                scrollSelectedTreeRowIntoView();
            } else {
                // Já expandida: avança para o primeiro filho se existir
                const nextNode = visibleTreeNodes[currentIdx + 1];
                if (nextNode && nextNode.parentDir === selectedTreePath) {
                    selectTreeNodeIncrementally(nextNode);
                }
            }
        }
        return;
    }

    if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (
            selectedTreeIsDir &&
            selectedTreePath &&
            expandedDirs.has(selectedTreePath)
        ) {
            expandedDirs.delete(selectedTreePath);
            renderFileTree();
            scrollSelectedTreeRowIntoView();
        } else if (selectedTreePath && !isWorkspaceRoot(selectedTreePath)) {
            const owningWs = findWorkspaceOfPath(selectedTreePath);
            const parent = getDirName(selectedTreePath);
            if (
                owningWs &&
                parent &&
                (parent === owningWs.root ||
                    parent.startsWith(owningWs.root + "/"))
            ) {
                const parentNode = visibleTreeNodes.find(
                    (n) => n.path === parent,
                );
                if (parentNode) {
                    selectTreeNodeIncrementally(parentNode);
                } else {
                    selectedTreePath = parent;
                    selectedTreeIsDir = true;
                    renderFileTree();
                    scrollSelectedTreeRowIntoView();
                    updateStatusBar();
                }
            }
        }
        return;
    }

    if (e.key === " ") {
        e.preventDefault();
        if (!selectedTreePath) return;
        if (selectedTreeIsDir) {
            if (expandedDirs.has(selectedTreePath)) {
                expandedDirs.delete(selectedTreePath);
            } else {
                expandedDirs.add(selectedTreePath);
            }
            renderFileTree();
            scrollSelectedTreeRowIntoView();
        } else {
            // Space abre o arquivo em modo preview (mantendo o foco na sidebar)
            void openFileInTab(selectedTreePath, false);
        }
        return;
    }

    if (e.key === "Enter") {
        e.preventDefault();
        if (!selectedTreePath) return;
        if (selectedTreeIsDir) {
            if (expandedDirs.has(selectedTreePath)) {
                expandedDirs.delete(selectedTreePath);
            } else {
                expandedDirs.add(selectedTreePath);
            }
            renderFileTree();
            scrollSelectedTreeRowIntoView();
        } else {
            void openFileInTab(selectedTreePath, true);
        }
        return;
    }

    // Type-ahead por letra/número na árvore
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (sidebarTypeAheadTimer) clearTimeout(sidebarTypeAheadTimer);
        sidebarTypeAheadBuffer += e.key.toLowerCase();
        sidebarTypeAheadTimer = setTimeout(() => {
            sidebarTypeAheadBuffer = "";
        }, 500);

        const start = (currentIdx + 1) % visibleTreeNodes.length;
        for (let offset = 0; offset < visibleTreeNodes.length; offset++) {
            const idx = (start + offset) % visibleTreeNodes.length;
            const candidate = visibleTreeNodes[idx];
            if (
                candidate.name.toLowerCase().startsWith(sidebarTypeAheadBuffer)
            ) {
                e.preventDefault();
                selectTreeNodeIncrementally(candidate);
                break;
            }
        }
    }
}

// Event Listeners & Global Shortcuts
function bindEvents(): void {
    btnGeckoBrand.addEventListener("click", (e) => {
        e.stopPropagation();
        openGeckoBrandMenu(btnGeckoBrand, false);
    });

    btnGeckoBrand.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            openGeckoBrandMenu(btnGeckoBrand, true);
        }
    });

    btnOpenFolder.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!contextMenuEl.classList.contains("hidden")) {
            closeContextMenu(true);
            return;
        }
        workbenchEl.classList.remove("sidebar-collapsed");
        const rect = btnOpenFolder.getBoundingClientRect();
        showContextMenu(
            rect.left,
            rect.bottom + 4,
            [
                {
                    label: "Abrir Workspace Existente...",
                    action: () => {
                        void handleSelectWorkspaceFolder();
                    },
                },
                {
                    label: "Criar Novo Workspace...",
                    action: () => {
                        void handleCreateFolder();
                    },
                },
            ],
            btnOpenFolder,
        );
    });
    emptyBtnOpenFolder.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!contextMenuEl.classList.contains("hidden")) {
            closeContextMenu(true);
            return;
        }
        const rect = emptyBtnOpenFolder.getBoundingClientRect();
        showContextMenu(
            rect.left,
            rect.bottom + 4,
            [
                {
                    label: "Abrir Workspace Existente...",
                    action: () => {
                        void handleSelectWorkspaceFolder();
                    },
                },
                {
                    label: "Criar Novo Workspace...",
                    action: () => {
                        void handleCreateFolder();
                    },
                },
            ],
            emptyBtnOpenFolder,
        );
    });

    emptyBtnNewFile.addEventListener("click", () => {
        void startCreateEntry(false);
    });

    const emptyBtnAllShortcuts = document.getElementById(
        "empty-btn-all-shortcuts",
    ) as HTMLButtonElement | null;
    if (emptyBtnAllShortcuts) {
        emptyBtnAllShortcuts.addEventListener("click", () => {
            openGeckoShortcutsModal();
        });
    }

    bindSidebarResizer();

    // Delegated listener for Workspace Header Action Buttons (.ws-action-btn) and empty space clicks
    fileTreeEl.addEventListener("click", (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const actionBtn = target.closest<HTMLButtonElement>(".ws-action-btn");
        if (actionBtn) {
            e.stopPropagation();
            closeContextMenu();

            const action = actionBtn.dataset.action;
            const wsRoot = actionBtn.dataset.root;
            const targetDir = actionBtn.dataset.targetDir || wsRoot;
            if (!wsRoot || !targetDir) return;

            selectedTreePath = targetDir;
            selectedTreeIsDir = true;

            if (action === "new-file") {
                void startCreateEntry(false, targetDir);
            } else if (action === "new-folder") {
                void startCreateEntry(true, targetDir);
            } else if (action === "sort") {
                openSortMenu(wsRoot, actionBtn);
            } else if (action === "refresh") {
                void refreshWorkspaceTree(wsRoot, true);
            }
            return;
        }

        // Clicking on empty area in file tree clears selection
        if (
            !target.closest(".tree-row") &&
            !target.closest("button") &&
            !target.closest("input")
        ) {
            clearTreeSelection();
        }
    });

    // Clicking on empty space elsewhere in the sidebar also clears selection
    sidebarEl.addEventListener("click", (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (
            target.closest(".tree-row") ||
            target.closest("button") ||
            target.closest("input") ||
            target.closest(".sidebar-actions")
        ) {
            return;
        }
        clearTreeSelection();
    });

    fileTreeEl.addEventListener("animationend", (e) => {
        const target = e.target as HTMLElement | null;
        if (target) {
            target.classList.remove("tree-flash");
        }
    });

    fileTreeEl.addEventListener("focus", () => {
        if (inlineTreeState || visibleTreeNodes.length === 0) return;
        if (!selectedTreePath) {
            const activeNode = activeTabPath
                ? visibleTreeNodes.find((n) => n.path === activeTabPath)
                : undefined;
            const targetNode = activeNode || visibleTreeNodes[0];
            if (targetNode) {
                selectedTreePath = targetNode.path;
                selectedTreeIsDir = targetNode.isDir;
                renderFileTree();
                scrollSelectedTreeRowIntoView();
                updateStatusBar();
            }
        } else {
            scrollSelectedTreeRowIntoView();
        }
    });

    fileTreeEl.addEventListener("keydown", handleSidebarKeyDown);
    tabListEl.addEventListener("keydown", handleTabBarKeyDown);

    btnToggleSidebar.addEventListener("click", () => {
        toggleSidebar();
    });

    statusStatsBtn.addEventListener("click", () => {
        toggleWritingStatsMode();
    });

    statusEncodingBtn.addEventListener("click", () => {
        toggleActiveLineEnding();
    });

    // When clicking or focusing in the editor pane, ensure the currently edited file is selected in the sidebar tree
    editorContainerEl.addEventListener("focusin", () => {
        syncActiveFileTreeSelection();
    });
    editorContainerEl.addEventListener("pointerdown", () => {
        syncActiveFileTreeSelection();
    });

    // Editor Context Menu (Right-click)
    editorContainerEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (!editorView) return;

        const pos = editorView.posAtCoords({ x: e.clientX, y: e.clientY });
        const sel = editorView.state.selection.main;
        const hasSelection = !sel.empty;
        const selectedText = hasSelection
            ? editorView.state.sliceDoc(sel.from, sel.to)
            : "";

        const options: ContextMenuOption[] = [];

        // Check if right-click was on a link
        let urlAtClick: string | null = null;
        if (pos != null) {
            urlAtClick = getUrlAtPos(editorView.state, pos);
        }

        if (urlAtClick) {
            const displayUrl =
                urlAtClick.length > 32
                    ? `${urlAtClick.slice(0, 32)}...`
                    : urlAtClick;
            options.push({
                label: `Abrir Link (${displayUrl})`,
                action: () => {
                    openExternalUrl(urlAtClick!);
                },
            });
            options.push({
                label: "Desativar / Remover Link",
                action: () => {
                    if (editorView) removeLinkAtCursor(editorView);
                },
            });
            options.push({ separator: true });
        }

        // Cut / Copy (if text is selected)
        if (hasSelection) {
            options.push({
                label: "Recortar (Ctrl+X)",
                action: () => {
                    void navigator.clipboard
                        .writeText(selectedText)
                        .then(() => {
                            if (editorView) {
                                editorView.dispatch(
                                    editorView.state.replaceSelection(""),
                                );
                                showTemporaryStatus("Recortado");
                            }
                        });
                },
            });
            options.push({
                label: "Copiar (Ctrl+C)",
                action: () => {
                    void navigator.clipboard
                        .writeText(selectedText)
                        .then(() => {
                            showTemporaryStatus(
                                "Copiado para a área de transferência",
                            );
                        });
                },
            });
        }

        // Paste formatted vs plain text
        options.push({
            label: "Colar com Formatação (Ctrl+V)",
            action: () => {
                void navigator.clipboard
                    .read()
                    .then(async (items) => {
                        for (const item of items) {
                            if (item.types.includes("text/html")) {
                                const blob = await item.getType("text/html");
                                const html = await blob.text();
                                const md = htmlToMarkdown(html);
                                if (md && editorView) {
                                    editorView.dispatch(
                                        editorView.state.replaceSelection(md),
                                    );
                                    showTemporaryStatus(
                                        "Colado com formatação Markdown",
                                    );
                                    return;
                                }
                            }
                        }
                        if (editorView) {
                            void pastePlainTextIntoView(
                                editorView,
                                showTemporaryStatus,
                            );
                        }
                    })
                    .catch(() => {
                        if (editorView) {
                            void pastePlainTextIntoView(
                                editorView,
                                showTemporaryStatus,
                            );
                        }
                    });
            },
        });

        options.push({
            label: "Colar Texto Puro (Ctrl+Shift+V)",
            action: () => {
                if (editorView) {
                    void pastePlainTextIntoView(
                        editorView,
                        showTemporaryStatus,
                    );
                }
            },
        });

        // Block transforms (if selection)
        if (hasSelection) {
            options.push({ separator: true });
            options.push({
                label: "Transformar em Lista com Marcadores (Ctrl+-)",
                action: () => {
                    if (editorView) toggleBulletListCommand(editorView);
                },
            });
            options.push({
                label: "Transformar em Lista Numerada (Ctrl+.)",
                action: () => {
                    if (editorView) toggleNumberedListCommand(editorView);
                },
            });
            options.push({
                label: "Transformar em Lista de Tarefas (Ctrl+;)",
                action: () => {
                    if (editorView) toggleTaskListCommand(editorView);
                },
            });
            options.push({
                label: "Transformar em Citação (Ctrl+Shift+.)",
                action: () => {
                    if (editorView) toggleBlockquoteCommand(editorView);
                },
            });
        }

        showContextMenu(e.clientX, e.clientY, options);
    });

    // Frameless Window Controls & Titlebar Double-click
    btnWinMinimize.addEventListener("click", () => {
        try {
            WindowMinimise();
        } catch {
            // Ignore outside Wails runtime
        }
    });

    btnWinMaximize.addEventListener("click", () => {
        void handleToggleMaximize();
    });

    btnWinClose.addEventListener("click", () => {
        requestQuitApp();
    });

    titlebarDragSpacerEl.addEventListener("dblclick", () => {
        void handleToggleMaximize();
    });

    sidebarHeaderEl.addEventListener("dblclick", (e) => {
        const target = e.target as HTMLElement | null;
        if (
            target &&
            (target.closest(".sidebar-actions") ||
                target.closest(".sidebar-brand"))
        ) {
            return;
        }
        void handleToggleMaximize();
    });

    window.addEventListener("resize", () => {
        void syncWindowMaximizedState();
        if (
            currentConflictAnchor &&
            conflictPopoverEl &&
            !conflictPopoverEl.classList.contains("hidden")
        ) {
            positionConflictPopover(currentConflictAnchor, conflictPopoverEl);
        }
    });

    fileTreeEl.addEventListener("scroll", () => {
        if (
            currentConflictAnchor &&
            conflictPopoverEl &&
            !conflictPopoverEl.classList.contains("hidden")
        ) {
            positionConflictPopover(currentConflictAnchor, conflictPopoverEl);
        }
    });

    tabListEl.addEventListener("scroll", () => {
        if (
            currentConflictAnchor &&
            conflictPopoverEl &&
            !conflictPopoverEl.classList.contains("hidden")
        ) {
            positionConflictPopover(currentConflictAnchor, conflictPopoverEl);
        }
    });

    // Pointer Drag-and-Drop for Top Tabs and Sidebar File Tree
    attachTabPointerDrag({
        container: tabListEl,
        onReorder: handleTabReorder,
    });

    attachTreePointerDrag({
        container: fileTreeEl,
        onDrop: (srcPath, srcIsDir, targetPath, targetIsDir, pos) => {
            void handleTreeDrop(
                srcPath,
                srcIsDir,
                targetPath,
                targetIsDir,
                pos,
            );
        },
        onAutoExpandDir: (dirPath) => {
            if (!expandedDirs.has(dirPath)) {
                expandedDirs.add(dirPath);
                renderFileTree();
            }
        },
    });

    // Right-click on empty area of sidebar file tree
    fileTreeEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        clearTreeSelection();
        const targetWs = findWorkspaceOfPath(selectedTreePath) || workspaces[0];
        if (!targetWs) {
            showContextMenu(e.clientX, e.clientY, [
                {
                    label: "Abrir Workspace",
                    action: () => void handleSelectWorkspaceFolder(),
                },
            ]);
            return;
        }

        showContextMenu(e.clientX, e.clientY, [
            {
                label: `Novo Arquivo .md (${getBaseName(targetWs.root)})`,
                action: () => void startCreateEntry(false, targetWs.root),
            },
            {
                label: `Nova Pasta (${getBaseName(targetWs.root)})`,
                action: () => void startCreateEntry(true, targetWs.root),
            },
            { separator: true },
            {
                label: "Abrir Workspace...",
                action: () => void handleSelectWorkspaceFolder(),
            },
            {
                label: "Atualizar Todos os Workspaces",
                action: () => void refreshWorkspaceTree(undefined, false),
            },
        ]);
    });

    document.addEventListener("click", (e) => {
        closeContextMenu();
        const target = e.target as HTMLElement | null;
        if (
            target &&
            (target.closest(".inline-conflict-popover") ||
                target.closest(".tree-inline-input") ||
                target.closest(".tab-inline-input"))
        ) {
            return;
        }
        hideConflictModal();
    });

    // Disable text selection and native dragging on all non-editable chrome elements
    document.addEventListener("selectstart", (e) => {
        const rawTarget = e.target as Node | null;
        const target =
            rawTarget instanceof HTMLElement
                ? rawTarget
                : (rawTarget?.parentElement ?? null);
        if (!target) return;
        if (
            target.closest("input") ||
            target.closest("textarea") ||
            target.closest("[contenteditable='true']") ||
            target.closest(".cm-content") ||
            target.closest(".cm-editor")
        ) {
            return;
        }
        e.preventDefault();
    });

    document.addEventListener("dragstart", (e) => {
        const rawTarget = e.target as Node | null;
        const target =
            rawTarget instanceof HTMLElement
                ? rawTarget
                : (rawTarget?.parentElement ?? null);
        if (!target) return;
        if (
            target.closest("input") ||
            target.closest("textarea") ||
            target.closest("[contenteditable='true']") ||
            target.closest(".cm-content") ||
            target.closest(".cm-editor")
        ) {
            return;
        }
        e.preventDefault();
    });

    quickOpenOverlayEl.addEventListener("click", (e) => {
        if (e.target === quickOpenOverlayEl) {
            closeQuickOpen();
        }
    });

    modalOverlayEl.addEventListener("click", (e) => {
        if (e.target === modalOverlayEl) {
            closeModal(true);
        }
    });

    quickOpenInputEl.addEventListener("input", () => {
        updateQuickOpenList(quickOpenInputEl.value);
    });

    // Regiões persistentes do Workbench para ciclo via F6 / Shift+F6
    registerRegion({
        id: "sidebar",
        order: 10,
        getRoot: () => sidebarEl,
        isAvailable: () => !workbenchEl.classList.contains("sidebar-collapsed"),
        focus: () => {
            if (workspaces.length > 0) {
                fileTreeEl.focus();
            } else {
                btnOpenFolder.focus();
            }
        },
    });

    registerRegion({
        id: "tabs",
        order: 20,
        getRoot: () => tabListEl,
        isAvailable: () => openTabs.length > 0,
        focus: () => {
            const activeIdx = Math.max(
                0,
                openTabs.findIndex((t) => t.path === activeTabPath),
            );
            tabBarNav.setIndex(activeIdx, {
                focus: true,
                notify: false,
                scroll: true,
            });
        },
    });

    registerRegion({
        id: "editor",
        order: 30,
        getRoot: () =>
            !editorContainerEl.classList.contains("hidden")
                ? editorContainerEl
                : emptyStateEl,
        isAvailable: () => true,
        focus: () => {
            if (
                editorView &&
                activeTabPath &&
                !editorContainerEl.classList.contains("hidden")
            ) {
                editorView.focus();
            } else {
                emptyBtnOpenFolder.focus();
            }
        },
    });

    registerRegion({
        id: "status",
        order: 40,
        getRoot: () => statusEncodingBtn.closest("footer"),
        isAvailable: () => Boolean(activeTabPath),
        focus: () => {
            if (!statusStatsBtn.classList.contains("hidden")) {
                statusStatsBtn.focus();
            } else {
                statusEncodingBtn.focus();
            }
        },
    });

    // Atalhos globais modulares gerenciados pelo Dispatcher central
    registerKeybindings([
        {
            key: "F6",
            description: "Focar próxima região do workbench",
            run: () => {
                cycleWorkbenchRegion(1);
            },
        },
        {
            key: "Shift-F6",
            description: "Focar região anterior do workbench",
            run: () => {
                cycleWorkbenchRegion(-1);
            },
        },
        {
            key: "Mod-Shift-e",
            description: "Focar explorador de arquivos na sidebar",
            run: () => {
                workbenchEl.classList.remove("sidebar-collapsed");
                focusRegion("sidebar");
            },
        },
        {
            key: "Ctrl-Shift-e",
            description: "Focar explorador de arquivos na sidebar",
            run: () => {
                workbenchEl.classList.remove("sidebar-collapsed");
                focusRegion("sidebar");
            },
        },
        {
            key: "Mod-Shift-a",
            description: "Focar barra de abas",
            run: () => {
                focusRegion("tabs");
            },
        },
        {
            key: "Ctrl-Shift-a",
            description: "Focar barra de abas",
            run: () => {
                focusRegion("tabs");
            },
        },
        {
            key: "Mod-Shift-m",
            description: "Focar editor de texto",
            run: () => {
                focusRegion("editor");
            },
        },
        {
            key: "Ctrl-Shift-m",
            description: "Focar editor de texto",
            run: () => {
                focusRegion("editor");
            },
        },
        {
            key: "Mod-Alt-e",
            description: "Focar editor de texto",
            run: () => {
                focusRegion("editor");
            },
        },
        {
            key: "Ctrl-Alt-e",
            description: "Focar editor de texto",
            run: () => {
                focusRegion("editor");
            },
        },
        // Pular diretamente para as abas 1 a 9 (Ctrl+1 a Ctrl+8 = índice; Ctrl+9 = última aba)
        ...Array.from({ length: 9 }, (_, i) => ({
            key: `Mod-${i + 1}`,
            description:
                i === 8
                    ? "Ir para a última aba aberta"
                    : `Ir para a aba ${i + 1}`,
            when: () => openTabs.length > 0,
            run: () => {
                activateTabByIndex(i);
            },
        })),
        ...Array.from({ length: 9 }, (_, i) => ({
            key: `Ctrl-${i + 1}`,
            description:
                i === 8
                    ? "Ir para a última aba aberta"
                    : `Ir para a aba ${i + 1}`,
            when: () => openTabs.length > 0,
            run: () => {
                activateTabByIndex(i);
            },
        })),
        {
            key: "Ctrl-Tab",
            description: "Próxima aba aberta",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(1);
            },
        },
        {
            key: "Mod-Tab",
            description: "Próxima aba aberta",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(1);
            },
        },
        {
            key: "Ctrl-Shift-Tab",
            description: "Aba aberta anterior",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(-1);
            },
        },
        {
            key: "Mod-Shift-Tab",
            description: "Aba aberta anterior",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(-1);
            },
        },
        {
            key: "Mod-PageDown",
            description: "Próxima aba aberta",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(1);
            },
        },
        {
            key: "Ctrl-PageDown",
            description: "Próxima aba aberta",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(1);
            },
        },
        {
            key: "Mod-PgDn",
            description: "Próxima aba aberta",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(1);
            },
        },
        {
            key: "Ctrl-PgDn",
            description: "Próxima aba aberta",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(1);
            },
        },
        {
            key: "Mod-PageUp",
            description: "Aba aberta anterior",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(-1);
            },
        },
        {
            key: "Ctrl-PageUp",
            description: "Aba aberta anterior",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(-1);
            },
        },
        {
            key: "Mod-PgUp",
            description: "Aba aberta anterior",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(-1);
            },
        },
        {
            key: "Ctrl-PgUp",
            description: "Aba aberta anterior",
            when: () => openTabs.length > 0,
            run: () => {
                cycleActiveTab(-1);
            },
        },
        {
            key: "Mod-Shift-PageUp",
            description: "Mover aba ativa para a esquerda",
            run: () => {
                moveActiveTabByOffset(-1);
            },
        },
        {
            key: "Ctrl-Shift-PageUp",
            description: "Mover aba ativa para a esquerda",
            run: () => {
                moveActiveTabByOffset(-1);
            },
        },
        {
            key: "Mod-Shift-PgUp",
            description: "Mover aba ativa para a esquerda",
            run: () => {
                moveActiveTabByOffset(-1);
            },
        },
        {
            key: "Ctrl-Shift-PgUp",
            description: "Mover aba ativa para a esquerda",
            run: () => {
                moveActiveTabByOffset(-1);
            },
        },
        {
            key: "Mod-Shift-PageDown",
            description: "Mover aba ativa para a direita",
            run: () => {
                moveActiveTabByOffset(1);
            },
        },
        {
            key: "Ctrl-Shift-PageDown",
            description: "Mover aba ativa para a direita",
            run: () => {
                moveActiveTabByOffset(1);
            },
        },
        {
            key: "Mod-Shift-PgDn",
            description: "Mover aba ativa para a direita",
            run: () => {
                moveActiveTabByOffset(1);
            },
        },
        {
            key: "Ctrl-Shift-PgDn",
            description: "Mover aba ativa para a direita",
            run: () => {
                moveActiveTabByOffset(1);
            },
        },
        {
            key: "Mod-s",
            description: "Salvar aba ativa",
            run: () => {
                void saveActiveTab();
            },
        },
        {
            key: "Mod-Shift-s",
            description: "Salvar como...",
            run: () => {
                if (activeTabPath) {
                    const tab = openTabs.find((t) => t.path === activeTabPath);
                    if (tab) void openIntegratedSaveFileModal(tab);
                }
            },
        },
        {
            key: "Mod-Shift-v",
            description: "Colar texto puro",
            when: () => Boolean(editorView),
            run: () => {
                if (editorView) {
                    void pastePlainTextIntoView(
                        editorView,
                        showTemporaryStatus,
                    );
                }
            },
        },
        {
            key: "Mod-t",
            description: "Nova aba sem título",
            run: () => {
                createNewUntitledTab();
            },
        },
        {
            key: "Mod-w",
            description: "Fechar aba ativa",
            run: () => {
                closeActiveTab();
            },
        },
        {
            key: "Mod-Shift-w",
            description: "Salvar e fechar todas as abas",
            run: () => {
                void saveAndCloseAllTabs();
            },
        },
        {
            key: "Mod-Alt-n",
            description: "Criar novo arquivo .md no workspace",
            run: () => {
                void startCreateEntry(false);
            },
        },
        {
            key: "Mod-p",
            description: "Buscar arquivo rápido (Quick Open)",
            run: () => {
                if (quickOpenVisible) {
                    closeQuickOpen(true);
                } else {
                    openQuickOpen();
                }
            },
        },
        {
            key: "Mod-\\",
            description: "Alternar barra lateral",
            run: () => {
                toggleSidebar();
            },
        },
        {
            key: "Mod-,",
            description: "Configurar cor principal do Gecko",
            run: () => {
                openPrimaryColorModal();
            },
        },
        {
            key: "F1",
            description: "Exibir mapa de atalhos de teclado",
            run: () => {
                openGeckoShortcutsModal();
            },
        },
        {
            key: "Mod-/",
            description: "Exibir mapa de atalhos de teclado",
            run: () => {
                openGeckoShortcutsModal();
            },
        },
        {
            key: "F11",
            description: "Alternar Modo Foco / Zen",
            run: () => {
                toggleZenMode();
            },
        },
        {
            key: "Alt-z",
            description: "Alternar Modo Foco / Zen",
            run: () => {
                toggleZenMode();
            },
        },
        {
            key: "Mod-Alt-z",
            description: "Alternar Modo Foco / Zen",
            run: () => {
                toggleZenMode();
            },
        },
        {
            key: "Escape",
            description: "Sair do Modo Zen / Fechar avisos de conflito",
            preventDefault: false,
            run: (e) => {
                hideConflictModal();
                if (isZenMode) {
                    exitZenMode();
                    e.preventDefault();
                    e.stopPropagation();
                    return true;
                }
                return false;
            },
        },
    ]);

    initKeyboardDispatcher();
    setupRuntimeListener();
}

function setupRuntimeListener(): void {
    const register = () => {
        EventsOn(
            "workspace:fs-event",
            (payload: { root?: string; path: string; op: string }) => {
                if (payload && payload.path) {
                    void handleFilesystemEvent(payload);
                }
            },
        );
        EventsOn("app:request-close", () => {
            requestQuitApp();
        });
    };

    try {
        if (
            typeof window !== "undefined" &&
            (window as any).runtime?.EventsOn
        ) {
            register();
        } else {
            const timer = setInterval(() => {
                if (
                    typeof window !== "undefined" &&
                    (window as any).runtime?.EventsOn
                ) {
                    clearInterval(timer);
                    register();
                }
            }, 100);
            setTimeout(() => clearInterval(timer), 5000);
        }
    } catch (err) {
        console.warn("Wails runtime not yet available:", err);
    }
}

async function initGecko(): Promise<void> {
    bindEvents();
    await loadAppSettings();
    applyGeckoThemeColor(appSettings.accentColor || DEFAULT_GECKO_BRAND_COLOR);
    applySidebarWidth(appSettings.sidebarWidth ?? SIDEBAR_DEFAULT_WIDTH);
    renderFileTree();
    renderTabs();
    updateStatusBar();
    void syncWindowMaximizedState();

    if (appSettings.workspaces && appSettings.workspaces.length > 0) {
        try {
            await loadInitialWorkspaces(appSettings.workspaces);
        } catch (err) {
            console.warn("Erro ao restaurar workspaces:", err);
        }
    }
}

void initGecko();

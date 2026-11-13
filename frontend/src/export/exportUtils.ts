import { PromptSaveExportFile, SaveBinaryFile } from '../../wailsjs/go/main/App';
import { ActiveLayer, createListNavigator, pushLayer } from '../keyboard';
import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from '../theme/colorEngine';

export type ExportThemeMode = 'dark' | 'light';
export type ExportImageFormat = 'png' | 'jpeg';
export type ExportFileFormat = 'pdf' | 'png' | 'jpeg';

export interface ExportPalette {
  mode: ExportThemeMode;
  bgPage: string;
  bgWorkbench: string;
  bgEditor: string;
  bgSurface: string;
  bgElevated: string;
  bgHeader: string;
  bgBadge: string;
  bgSelection: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  brandColor: string;
  accentPrimary: string;
  accentHover: string;
  mdHeading: string;
  mdMarker: string;
  accentAlpha18: string;
  accentAlpha30: string;
  accentAlpha45: string;
  fontSans: string;
  fontMono: string;
}

export interface ExportHostBridge {
  getDefaultDir: () => string;
  getActiveFileStem: () => string;
  notifyStatus: (message: string) => void;
}

export interface ExportSaveResult {
  saved: boolean;
  cancelled?: boolean;
  path?: string;
}

export interface ExportMenuItem {
  label?: string;
  shortcut?: string;
  separator?: boolean;
  action?: () => void | Promise<void>;
}

const DEFAULT_HOST: ExportHostBridge = {
  getDefaultDir: () => '',
  getActiveFileStem: () => 'documento',
  notifyStatus: () => {},
};

let hostBridge: ExportHostBridge = DEFAULT_HOST;
let activeMenuEl: HTMLElement | null = null;
let activeMenuAnchor: HTMLElement | null = null;
let activeMenuLayer: ActiveLayer | null = null;
let activeMenuCleanup: (() => void) | null = null;

export function registerExportHost(bridge: ExportHostBridge): void {
  hostBridge = bridge;
}

export function getExportHost(): ExportHostBridge {
  return hostBridge;
}

export function sanitizeFileStem(rawName: string, fallback = 'gecko-export'): string {
  const withoutExt = rawName.replace(/\.(md|markdown|pdf|png|jpe?g)$/i, '');
  const cleaned = withoutExt
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

function readCssVar(style: CSSStyleDeclaration | null, name: string, fallback: string): string {
  if (!style) return fallback;
  const val = style.getPropertyValue(name)?.trim();
  return val || fallback;
}

function derivePrintAccent(brandHex: string): string {
  const clean = brandHex.trim();
  const baseHex = clean.startsWith('#') ? clean : '#2EA043';
  const hsl = rgbToHsl(hexToRgb(baseHex));
  const clampedL = Math.min(34, Math.max(20, hsl.l));
  const clampedS = Math.min(82, Math.max(28, hsl.s));
  return rgbToHex(hslToRgb({ h: hsl.h, s: clampedS, l: clampedL }));
}

export function resolveExportPalette(mode: ExportThemeMode): ExportPalette {
  const style =
    typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(document.documentElement)
      : null;

  const fontSans = readCssVar(
    style,
    '--font-sans',
    "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
  ).replace(/"/g, "'");
  const fontMono = readCssVar(
    style,
    '--font-mono',
    "'JetBrains Mono', 'Fira Code', monospace"
  ).replace(/"/g, "'");
  const brandColor = readCssVar(style, '--brand-color', '#4CF00C');

  if (mode === 'light') {
    const accent = derivePrintAccent(readCssVar(style, '--accent-primary', brandColor));
    const rgb = hexToRgb(accent);
    return {
      mode: 'light',
      bgPage: '#FFFFFF',
      bgWorkbench: '#F4F5F7',
      bgEditor: '#FFFFFF',
      bgSurface: '#FFFFFF',
      bgElevated: '#F6F7F9',
      bgHeader: '#EDF0F4',
      bgBadge: '#EFF1F4',
      bgSelection: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
      borderSubtle: '#D4D4D8',
      textPrimary: '#18181B',
      textSecondary: '#52525B',
      textMuted: '#71717A',
      brandColor: accent,
      accentPrimary: accent,
      accentHover: accent,
      mdHeading: '#111827',
      mdMarker: accent,
      accentAlpha18: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`,
      accentAlpha30: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`,
      accentAlpha45: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`,
      fontSans,
      fontMono,
    };
  }

  return {
    mode: 'dark',
    bgPage: readCssVar(style, '--bg-editor', '#1E1E1E'),
    bgWorkbench: readCssVar(style, '--bg-workbench', '#181818'),
    bgEditor: readCssVar(style, '--bg-editor', '#1E1E1E'),
    bgSurface: readCssVar(style, '--bg-surface', readCssVar(style, '--bg-editor', '#1E1E1E')),
    bgElevated: readCssVar(style, '--bg-elevated', '#252526'),
    bgHeader: readCssVar(style, '--bg-active-line', '#232323'),
    bgBadge: readCssVar(style, '--bg-badge', '#2B2B2B'),
    bgSelection: readCssVar(style, '--bg-selection', '#1F4429'),
    borderSubtle: readCssVar(style, '--border-subtle', '#2B2B2B'),
    textPrimary: readCssVar(style, '--text-primary', '#D4D4D4'),
    textSecondary: readCssVar(style, '--text-secondary', '#858585'),
    textMuted: readCssVar(style, '--text-muted', '#6E7681'),
    brandColor,
    accentPrimary: readCssVar(style, '--accent-primary', '#2EA043'),
    accentHover: readCssVar(style, '--accent-hover', '#238636'),
    mdHeading: readCssVar(style, '--md-heading', '#6BC46D'),
    mdMarker: readCssVar(style, '--md-marker', '#85B66E'),
    accentAlpha18: readCssVar(style, '--accent-alpha-18', 'rgba(46, 160, 67, 0.18)'),
    accentAlpha30: readCssVar(style, '--accent-alpha-30', 'rgba(46, 204, 113, 0.30)'),
    accentAlpha45: readCssVar(style, '--accent-alpha-45', 'rgba(46, 160, 67, 0.45)'),
    fontSans,
    fontMono,
  };
}

function resolveSvgVarString(rawValue: string, palette: ExportPalette): string {
  if (!rawValue.includes('var(')) return rawValue;

  const map: Record<string, string> = {
    '--bg-workbench': palette.bgWorkbench,
    '--bg-editor': palette.bgEditor,
    '--bg-surface': palette.bgSurface,
    '--bg-elevated': palette.bgElevated,
    '--bg-active-line': palette.bgHeader,
    '--bg-selection': palette.bgSelection,
    '--border-subtle': palette.borderSubtle,
    '--text-primary': palette.textPrimary,
    '--text-secondary': palette.textSecondary,
    '--text-muted': palette.textMuted,
    '--brand-color': palette.brandColor,
    '--accent-primary': palette.accentPrimary,
    '--accent-hover': palette.accentHover,
    '--md-heading': palette.mdHeading,
    '--md-marker': palette.mdMarker,
    '--accent-alpha-18': palette.accentAlpha18,
    '--accent-alpha-30': palette.accentAlpha30,
    '--accent-alpha-45': palette.accentAlpha45,
    '--font-sans': palette.fontSans,
    '--font-mono': palette.fontMono,
  };

  return rawValue.replace(/var\(\s*(--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\s*\)/g, (_m, varName, fallback) => {
    return map[varName] || (fallback ? fallback.trim() : '#888888');
  });
}

export function prepareStandaloneSvg(
  svgElement: SVGSVGElement,
  logicalW: number,
  logicalH: number,
  palette: ExportPalette,
  scale = 2
): string {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  const exportW = Math.max(1, Math.round(logicalW * scale));
  const exportH = Math.max(1, Math.round(logicalH * scale));

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${logicalW} ${logicalH}`);
  }
  clone.setAttribute('width', String(exportW));
  clone.setAttribute('height', String(exportH));

  // Inject explicit opaque background as the very first child so PNG/JPEG have clean backdrop
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', '0');
  bgRect.setAttribute('y', '0');
  bgRect.setAttribute('width', String(logicalW));
  bgRect.setAttribute('height', String(logicalH));
  bgRect.setAttribute('fill', palette.bgSurface);
  clone.insertBefore(bgRect, clone.firstChild);

  const walkResolveVars = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes('var(')) {
        el.setAttribute(attr.name, resolveSvgVarString(attr.value, palette));
      }
    }
    for (const child of Array.from(el.children)) {
      walkResolveVars(child);
    }
  };
  walkResolveVars(clone);

  return new XMLSerializer().serializeToString(clone);
}

export function rasterizeSvgToCanvas(
  svgElement: SVGSVGElement,
  logicalW: number,
  logicalH: number,
  palette: ExportPalette,
  scale = 2
): Promise<HTMLCanvasElement> {
  const svgXml = prepareStandaloneSvg(svgElement, logicalW, logicalH, palette, scale);
  const encoded = btoa(unescape(encodeURIComponent(svgXml)));
  const dataUrl = `data:image/svg+xml;base64,${encoded}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(logicalW * scale));
      canvas.height = Math.max(1, Math.round(logicalH * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Contexto 2D indisponível para renderização de imagem'));
        return;
      }
      ctx.fillStyle = palette.bgSurface;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => {
      reject(new Error('Falha ao converter diagrama SVG em imagem raster'));
    };
    img.src = dataUrl;
  });
}

export function canvasToBase64(canvas: HTMLCanvasElement, format: ExportImageFormat): string {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? 0.94 : undefined;
  const dataUrl = canvas.toDataURL(mime, quality);
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

function hasWailsBinaryRuntime(): boolean {
  const win = window as unknown as {
    go?: {
      main?: {
        App?: {
          PromptSaveExportFile?: unknown;
          SaveBinaryFile?: unknown;
        };
      };
    };
  };
  return (
    typeof win?.go?.main?.App?.PromptSaveExportFile === 'function' &&
    typeof win?.go?.main?.App?.SaveBinaryFile === 'function'
  );
}

function triggerBrowserBlobDownload(filename: string, mime: string, base64Data: string): void {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportBase64Binary(
  suggestedStem: string,
  format: ExportFileFormat,
  base64Data: string,
  overrideDir?: string
): Promise<ExportSaveResult> {
  const ext = format === 'jpeg' ? 'jpg' : format;
  const filename = `${sanitizeFileStem(suggestedStem)}.${ext}`;
  const defaultDir = overrideDir ?? hostBridge.getDefaultDir();

  if (hasWailsBinaryRuntime()) {
    const chosenPath = await PromptSaveExportFile(defaultDir, filename, format);
    if (!chosenPath) {
      return { saved: false, cancelled: true };
    }
    await SaveBinaryFile(chosenPath, base64Data);
    return { saved: true, path: chosenPath };
  }

  const mime =
    format === 'pdf' ? 'application/pdf' : format === 'jpeg' ? 'image/jpeg' : 'image/png';
  triggerBrowserBlobDownload(filename, mime, base64Data);
  return { saved: true, path: filename };
}

export async function exportDiagramImage(opts: {
  svg: SVGSVGElement;
  width: number;
  height: number;
  label: string;
  format: ExportImageFormat;
  theme: ExportThemeMode;
}): Promise<ExportSaveResult> {
  const palette = resolveExportPalette(opts.theme);
  const canvas = await rasterizeSvgToCanvas(opts.svg, opts.width, opts.height, palette, 2);
  const base64 = canvasToBase64(canvas, opts.format);

  const fileStem = sanitizeFileStem(hostBridge.getActiveFileStem(), 'documento');
  const labelStem = sanitizeFileStem(opts.label, 'diagrama');
  const suggested = `${fileStem}-${labelStem}`;

  const result = await exportBase64Binary(suggested, opts.format, base64);
  if (result.saved) {
    const tag = opts.format === 'jpeg' ? 'JPEG' : 'PNG';
    hostBridge.notifyStatus(`Exportado ${tag}: ${result.path ?? suggested}`);
  }
  return result;
}

export function closeExportMenu(restoreFocus = false): void {
  if (activeMenuCleanup) {
    activeMenuCleanup();
    activeMenuCleanup = null;
  }
  if (activeMenuEl) {
    activeMenuEl.remove();
    activeMenuEl = null;
  }
  activeMenuAnchor = null;
  const layer = activeMenuLayer;
  activeMenuLayer = null;
  layer?.close({ restoreFocus });
}

export function openExportMenu(anchorEl: HTMLElement, items: ExportMenuItem[]): void {
  if (activeMenuEl && activeMenuAnchor === anchorEl) {
    closeExportMenu(true);
    return;
  }
  closeExportMenu(false);
  activeMenuAnchor = anchorEl;

  const menu = document.createElement('div');
  menu.className = 'context-menu gecko-export-menu';
  menu.setAttribute('role', 'menu');
  menu.tabIndex = -1;

  const buttonEls: HTMLButtonElement[] = [];
  const buttonActions: Array<() => void> = [];

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-sep';
      menu.appendChild(sep);
      continue;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'context-menu-item';
    btn.setAttribute('role', 'menuitem');

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label || '';
    btn.appendChild(labelSpan);

    if (item.shortcut) {
      const metaSpan = document.createElement('span');
      metaSpan.className = 'gecko-export-menu-meta';
      metaSpan.textContent = item.shortcut;
      btn.appendChild(metaSpan);
    }

    const idx = buttonEls.length;
    const runAction = () => {
      closeExportMenu(true);
      void item.action?.();
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      runAction();
    });
    btn.addEventListener('pointerenter', () => {
      nav.setIndex(idx, { focus: false, notify: true, scroll: false });
    });

    buttonEls.push(btn);
    buttonActions.push(runAction);
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeMenuEl = menu;

  // Position cleanly near anchor button within viewport bounds
  const rect = anchorEl.getBoundingClientRect();
  const menuW = Math.max(220, menu.offsetWidth || 236);
  const menuH = menu.offsetHeight || buttonEls.length * 28 + 12;
  const maxX = Math.max(8, window.innerWidth - menuW - 8);
  const maxY = Math.max(8, window.innerHeight - menuH - 8);
  const left = Math.min(maxX, Math.max(8, rect.right - menuW));
  const top = rect.bottom + 4 + menuH <= window.innerHeight - 8 ? rect.bottom + 4 : Math.max(8, rect.top - menuH - 4);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(Math.min(maxY, top))}px`;

  const nav = createListNavigator({
    container: menu,
    getItems: () => buttonEls,
    wrap: true,
    onSelect: (activeIdx) => {
      buttonEls.forEach((b, i) => b.classList.toggle('selected', i === activeIdx));
    },
    onActivate: (idx) => {
      buttonActions[idx]?.();
    },
  });

  menu.addEventListener('pointerleave', () => nav.clearSelection());
  nav.first(true);

  const onOutsidePointerDown = (e: MouseEvent) => {
    const target = e.target as Node | null;
    if (target && !menu.contains(target) && !anchorEl.contains(target)) {
      closeExportMenu(false);
    }
  };
  window.addEventListener('mousedown', onOutsidePointerDown, true);
  activeMenuCleanup = () => {
    window.removeEventListener('mousedown', onOutsidePointerDown, true);
  };

  activeMenuLayer = pushLayer({
    id: 'export-menu',
    element: menu,
    kind: 'popup',
    restoreFocusTo: anchorEl,
    initialFocus: () => buttonEls[nav.getIndex()] || buttonEls[0] || menu,
    onEscape: () => {
      closeExportMenu(true);
      return true;
    },
    closeOnTab: () => {
      closeExportMenu(true);
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        nav.activateCurrent(e);
        return true;
      }
      return nav.handleKeyDown(e);
    },
  });
}

export function openImageExportMenu(
  anchorBtn: HTMLButtonElement,
  onExport: (format: ExportImageFormat, theme: ExportThemeMode) => Promise<ExportSaveResult>
): void {
  const run = async (format: ExportImageFormat, theme: ExportThemeMode) => {
    const labelSpan = anchorBtn.querySelector('span');
    const prevLabel = labelSpan?.textContent ?? 'Exportar';
    anchorBtn.disabled = true;
    if (labelSpan) labelSpan.textContent = 'Exportando...';
    try {
      const res = await onExport(format, theme);
      if (res.saved && labelSpan && labelSpan.isConnected) {
        labelSpan.textContent = 'Exportado';
        setTimeout(() => {
          if (labelSpan.isConnected) labelSpan.textContent = prevLabel;
        }, 1600);
      }
    } catch (err) {
      console.error('Gecko: falha ao exportar imagem', err);
      hostBridge.notifyStatus('Erro ao exportar imagem.');
    } finally {
      anchorBtn.disabled = false;
      if (labelSpan && labelSpan.isConnected && labelSpan.textContent === 'Exportando...') {
        labelSpan.textContent = prevLabel;
      }
    }
  };

  openExportMenu(anchorBtn, [
    {
      label: 'Exportar PNG',
      shortcut: 'Tema atual',
      action: () => run('png', 'dark'),
    },
    {
      label: 'Exportar JPEG',
      shortcut: 'Tema atual',
      action: () => run('jpeg', 'dark'),
    },
    { separator: true },
    {
      label: 'Exportar PNG',
      shortcut: 'Fundo claro',
      action: () => run('png', 'light'),
    },
    {
      label: 'Exportar JPEG',
      shortcut: 'Fundo claro',
      action: () => run('jpeg', 'light'),
    },
  ]);
}

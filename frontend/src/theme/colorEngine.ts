/**
 * Motor de cores do Gecko (Zero dependências externas).
 * Converte entre HEX, RGB, HSL e HSV e deriva automaticamente todos os tons
 * da interface (acento primário, hover, títulos Markdown, marcadores e seleção)
 * a partir da cor principal escolhida pelo usuário.
 */

export const DEFAULT_GECKO_BRAND_COLOR = "#4CF00C";

export interface RGB {
    r: number; // 0..255
    g: number; // 0..255
    b: number; // 0..255
}

export interface HSL {
    h: number; // 0..360
    s: number; // 0..100
    l: number; // 0..100
}

export interface HSV {
    h: number; // 0..360
    s: number; // 0..100
    v: number; // 0..100
}

export interface GeckoDerivedPalette {
    brandColor: string;
    accentPrimary: string;
    accentHover: string;
    mdHeading: string;
    mdMarker: string;
    bgSelection: string;
    accentAlpha06: string;
    accentAlpha16: string;
    accentAlpha18: string;
    accentAlpha25: string;
    accentAlpha30: string;
    accentAlpha35: string;
    accentAlpha45: string;
    accentSearchActiveBg: string;
    accentSearchActiveBorder: string;
}

function clamp(val: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, val));
}

export function normalizeHex(input: string): string | null {
    const cleaned = input.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
        const r = cleaned[0] + cleaned[0];
        const g = cleaned[1] + cleaned[1];
        const b = cleaned[2] + cleaned[2];
        return `#${(r + g + b).toUpperCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
        return `#${cleaned.toUpperCase()}`;
    }
    return null;
}

export function hexToRgb(hex: string): RGB {
    const norm = normalizeHex(hex) || DEFAULT_GECKO_BRAND_COLOR;
    const raw = norm.slice(1);
    return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16),
    };
}

export function rgbToHex({ r, g, b }: RGB): string {
    const toHex = (n: number) =>
        clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0").toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;

    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;

    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (d !== 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rn:
                h = (gn - bn) / d + (gn < bn ? 6 : 0);
                break;
            case gn:
                h = (bn - rn) / d + 2;
                break;
            case bn:
                h = (rn - gn) / d + 4;
                break;
        }
        h *= 60;
    }

    return {
        h: Math.round(h * 10) / 10,
        s: Math.round(s * 1000) / 10,
        l: Math.round(l * 1000) / 10,
    };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
    const hn = ((h % 360) + 360) % 360;
    const sn = clamp(s, 0, 100) / 100;
    const ln = clamp(l, 0, 100) / 100;

    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = ln - c / 2;

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;

    if (hn >= 0 && hn < 60) {
        r1 = c;
        g1 = x;
    } else if (hn >= 60 && hn < 120) {
        r1 = x;
        g1 = c;
    } else if (hn >= 120 && hn < 180) {
        g1 = c;
        b1 = x;
    } else if (hn >= 180 && hn < 240) {
        g1 = x;
        b1 = c;
    } else if (hn >= 240 && hn < 300) {
        r1 = x;
        b1 = c;
    } else {
        r1 = c;
        b1 = x;
    }

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    };
}

export function hslToHex(h: number, s: number, l: number): string {
    return rgbToHex(hslToRgb({ h, s, l }));
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;

    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;

    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (d !== 0) {
        switch (max) {
            case rn:
                h = (gn - bn) / d + (gn < bn ? 6 : 0);
                break;
            case gn:
                h = (bn - rn) / d + 2;
                break;
            case bn:
                h = (rn - gn) / d + 4;
                break;
        }
        h *= 60;
    }

    return {
        h: ((h % 360) + 360) % 360,
        s: s * 100,
        v: v * 100,
    };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
    const hn = ((h % 360) + 360) % 360;
    const sn = clamp(s, 0, 100) / 100;
    const vn = clamp(v, 0, 100) / 100;

    const c = vn * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = vn - c;

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;

    if (hn >= 0 && hn < 60) {
        r1 = c;
        g1 = x;
    } else if (hn >= 60 && hn < 120) {
        r1 = x;
        g1 = c;
    } else if (hn >= 120 && hn < 180) {
        g1 = c;
        b1 = x;
    } else if (hn >= 180 && hn < 240) {
        g1 = x;
        b1 = c;
    } else if (hn >= 240 && hn < 300) {
        r1 = x;
        b1 = c;
    } else {
        r1 = c;
        b1 = x;
    }

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    };
}

/**
 * Deriva todos os tokens de cor da UI a partir da cor principal escolhida.
 * Quando a cor é o Verde Gecko padrão (#4CF00C), preserva exatamente a paleta original.
 */
export function deriveGeckoPalette(baseHexInput: string): GeckoDerivedPalette {
    const brandColor = normalizeHex(baseHexInput) || DEFAULT_GECKO_BRAND_COLOR;

    if (brandColor === DEFAULT_GECKO_BRAND_COLOR) {
        return {
            brandColor: "#4CF00C",
            accentPrimary: "#2EA043",
            accentHover: "#238636",
            mdHeading: "#6BC46D",
            mdMarker: "#85B66E",
            bgSelection: "#1F4429",
            accentAlpha06: "rgba(46, 160, 67, 0.06)",
            accentAlpha16: "rgba(46, 160, 67, 0.16)",
            accentAlpha18: "rgba(46, 160, 67, 0.18)",
            accentAlpha25: "rgba(46, 204, 113, 0.25)",
            accentAlpha30: "rgba(46, 204, 113, 0.30)",
            accentAlpha35: "rgba(46, 160, 67, 0.35)",
            accentAlpha45: "rgba(46, 160, 67, 0.45)",
            accentSearchActiveBg: "rgba(63, 185, 80, 0.55)",
            accentSearchActiveBorder: "#3FB950",
        };
    }

    const rgb = hexToRgb(brandColor);
    const { h, s, l } = rgbToHsl(rgb);
    const isAchromatic = s < 5;

    const primaryS = isAchromatic ? 0 : clamp(s * 0.65, 28, 72);
    const primaryL = clamp(l * 0.85, 36, 48);
    const accentPrimary = hslToHex(h, primaryS, primaryL);

    const hoverS = isAchromatic ? 0 : clamp(s * 0.68, 30, 75);
    const hoverL = clamp(primaryL - 7, 28, 40);
    const accentHover = hslToHex(h, hoverS, hoverL);

    const headingS = isAchromatic ? 0 : clamp(s * 0.52, 24, 64);
    const headingL = clamp(l * 1.15, 56, 70);
    const mdHeading = hslToHex(h, headingS, headingL);

    const markerS = isAchromatic ? 0 : clamp(s * 0.38, 18, 46);
    const markerL = clamp(l * 1.08, 52, 64);
    const mdMarker = hslToHex(h, markerS, markerL);

    const selS = isAchromatic ? 0 : clamp(s * 0.42, 16, 42);
    const selL = clamp(l * 0.38, 16, 23);
    const bgSelection = hslToHex(h, selS, selL);

    const pRgb = hexToRgb(accentPrimary);
    const searchActiveHex = hslToHex(
        h,
        isAchromatic ? 0 : clamp(s * 0.68, 35, 76),
        clamp(primaryL + 8, 44, 56),
    );
    const sRgb = hexToRgb(searchActiveHex);

    return {
        brandColor,
        accentPrimary,
        accentHover,
        mdHeading,
        mdMarker,
        bgSelection,
        accentAlpha06: `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.06)`,
        accentAlpha16: `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.16)`,
        accentAlpha18: `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.18)`,
        accentAlpha25: `rgba(${sRgb.r}, ${sRgb.g}, ${sRgb.b}, 0.25)`,
        accentAlpha30: `rgba(${sRgb.r}, ${sRgb.g}, ${sRgb.b}, 0.30)`,
        accentAlpha35: `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.35)`,
        accentAlpha45: `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.45)`,
        accentSearchActiveBg: `rgba(${sRgb.r}, ${sRgb.g}, ${sRgb.b}, 0.55)`,
        accentSearchActiveBorder: searchActiveHex,
    };
}

export const STORAGE_THEME_PALETTE_CACHE = "gecko:themePaletteCache";
export const STORAGE_ACCENT_COLOR_KEY = "gecko:accentColor";

/**
 * Aplica imediatamente (0ms) todos os tokens de cor derivados no `:root` do documento,
 * atualiza o cache síncrono de boot e notifica componentes em Canvas (ex: Minimap).
 */
export function applyGeckoThemeColor(
    baseHexInput?: string,
    persistBootCache = true,
): GeckoDerivedPalette {
    const palette = deriveGeckoPalette(baseHexInput || DEFAULT_GECKO_BRAND_COLOR);
    const root = document.documentElement;

    root.style.setProperty("--brand-color", palette.brandColor);
    root.style.setProperty("--accent-primary", palette.accentPrimary);
    root.style.setProperty("--accent-hover", palette.accentHover);
    root.style.setProperty("--md-heading", palette.mdHeading);
    root.style.setProperty("--md-marker", palette.mdMarker);
    root.style.setProperty("--bg-selection", palette.bgSelection);
    root.style.setProperty("--accent-alpha-06", palette.accentAlpha06);
    root.style.setProperty("--accent-alpha-16", palette.accentAlpha16);
    root.style.setProperty("--accent-alpha-18", palette.accentAlpha18);
    root.style.setProperty("--accent-alpha-25", palette.accentAlpha25);
    root.style.setProperty("--accent-alpha-30", palette.accentAlpha30);
    root.style.setProperty("--accent-alpha-35", palette.accentAlpha35);
    root.style.setProperty("--accent-alpha-45", palette.accentAlpha45);
    root.style.setProperty("--accent-search-active-bg", palette.accentSearchActiveBg);
    root.style.setProperty(
        "--accent-search-active-border",
        palette.accentSearchActiveBorder,
    );
    root.classList.add("gecko-theme-ready");

    if (persistBootCache) {
        try {
            localStorage.setItem(STORAGE_ACCENT_COLOR_KEY, palette.brandColor);
            localStorage.setItem(
                STORAGE_THEME_PALETTE_CACHE,
                JSON.stringify(palette),
            );
        } catch {
            // Ignore storage write errors
        }
    }

    window.dispatchEvent(
        new CustomEvent("gecko:theme-color-changed", { detail: palette }),
    );

    return palette;
}

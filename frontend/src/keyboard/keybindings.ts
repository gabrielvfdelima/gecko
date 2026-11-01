/**
 * Parser e avaliador de atalhos de teclado do Gecko.
 * Compatível com a sintaxe do CodeMirror ("Mod-Shift-e", "F6", "Shift-F10", "ArrowDown").
 */

import { isTextInput } from "./focusUtils";

export interface KeyBinding {
    /** Expressão do atalho: ex. "Mod-s", "Mod-Shift-e", "F6", "Shift-F10", "ArrowDown" */
    key: string;
    /** Ação executada. Retorne `false` explicitamente caso queira deixar o evento propagar; `true` ou `void` consome o evento. */
    run: (e: KeyboardEvent) => boolean | void;
    /** Condição opcional de ativação do atalho */
    when?: () => boolean;
    /**
     * Define se o atalho deve disparar quando o foco está em um input/textarea/editor.
     * Por padrão: `true` para atalhos com Ctrl/Meta/Alt ou teclas F1-F12/Escape/Tab;
     * `false` para teclas de caractere simples ou setas/Backspace/Delete sem modificador.
     */
    allowInInput?: boolean;
    /** Se `true` (padrão), chama e.preventDefault() e e.stopPropagation() ao consumir */
    preventDefault?: boolean;
    /** Descrição legível opcional para documentação/inspeção */
    description?: string;
}

interface ParsedShortcut {
    mod: boolean;
    ctrl: boolean;
    meta: boolean;
    alt: boolean;
    shift: boolean;
    keyNorm: string;
    hasModifierOrFunctionKey: boolean;
}

const KEY_ALIASES: Record<string, string> = {
    esc: "escape",
    return: "enter",
    space: " ",
    spacebar: " ",
    up: "arrowup",
    down: "arrowdown",
    left: "arrowleft",
    right: "arrowright",
    pgup: "pageup",
    pgdn: "pagedown",
    pageup: "pageup",
    pagedown: "pagedown",
    prior: "pageup",
    next: "pagedown",
    backtab: "tab",
    isolefttab: "tab",
    del: "delete",
    ins: "insert",
    numpadpageup: "pageup",
    numpadpagedown: "pagedown",
    numpadprior: "pageup",
    numpadnext: "pagedown",
    digit1: "1",
    digit2: "2",
    digit3: "3",
    digit4: "4",
    digit5: "5",
    digit6: "6",
    digit7: "7",
    digit8: "8",
    digit9: "9",
    digit0: "0",
    numpad1: "1",
    numpad2: "2",
    numpad3: "3",
    numpad4: "4",
    numpad5: "5",
    numpad6: "6",
    numpad7: "7",
    numpad8: "8",
    numpad9: "9",
    numpad0: "0",
};

function cleanKey(raw: string): string {
    return (raw || "").toLowerCase().replace(/[_\s-]/g, "");
}

function normalizeKeyName(raw: string): string {
    const cleaned = cleanKey(raw);
    return KEY_ALIASES[cleaned] ?? cleaned;
}

const parsedCache = new Map<string, ParsedShortcut>();

export function parseShortcut(spec: string): ParsedShortcut {
    const cached = parsedCache.get(spec);
    if (cached) return cached;

    // Trata caso especial "Mod--" (Ctrl + hífen)
    const normalizedSpec = spec.endsWith("--")
        ? spec.slice(0, -1) + "Minus"
        : spec;

    const parts = normalizedSpec.split("-");
    let mod = false;
    let ctrl = false;
    let meta = false;
    let alt = false;
    let shift = false;
    let mainKey = "";

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const lower = part.toLowerCase();
        if (i < parts.length - 1) {
            if (lower === "mod" || lower === "cmdorctrl") {
                mod = true;
                continue;
            }
            if (lower === "ctrl" || lower === "control") {
                ctrl = true;
                continue;
            }
            if (lower === "meta" || lower === "cmd" || lower === "super") {
                meta = true;
                continue;
            }
            if (lower === "alt" || lower === "option") {
                alt = true;
                continue;
            }
            if (lower === "shift") {
                shift = true;
                continue;
            }
        }
        mainKey = part === "Minus" ? "-" : part;
    }

    const keyNorm = normalizeKeyName(mainKey);
    const isFunctionKey = /^f([1-9]|1[0-2])$/.test(keyNorm);
    const hasModifierOrFunctionKey =
        mod ||
        ctrl ||
        meta ||
        alt ||
        isFunctionKey ||
        keyNorm === "escape" ||
        keyNorm === "tab" ||
        keyNorm === "contextmenu";

    const parsed: ParsedShortcut = {
        mod,
        ctrl,
        meta,
        alt,
        shift,
        keyNorm,
        hasModifierOrFunctionKey,
    };
    parsedCache.set(spec, parsed);
    return parsed;
}

export function matchesKeyEvent(
    spec: string,
    e: KeyboardEvent,
): boolean {
    const p = parseShortcut(spec);
    const eventMod = e.ctrlKey || e.metaKey;

    if (p.mod) {
        if (!eventMod) return false;
    } else {
        if (p.ctrl !== e.ctrlKey) return false;
        if (p.meta !== e.metaKey) return false;
    }

    if (p.alt !== e.altKey) return false;

    // Detecta Shift+Tab considerando peculiaridades de Linux/WebKit (e.key="BackTab" ou "ISO_Left_Tab")
    const isShiftTab =
        cleanKey(e.key) === "backtab" ||
        cleanKey(e.key) === "isolefttab" ||
        (e.shiftKey &&
            (normalizeKeyName(e.key) === "tab" ||
                normalizeKeyName(e.code) === "tab"));

    if (p.keyNorm === "tab") {
        if (p.shift) {
            if (!isShiftTab) return false;
        } else {
            if (isShiftTab || e.shiftKey) return false;
        }
    } else {
        if (p.shift !== e.shiftKey) return false;
    }

    const eventKey = normalizeKeyName(e.key);
    const eventCode = normalizeKeyName(e.code);

    return (
        eventKey === p.keyNorm ||
        eventCode === p.keyNorm ||
        (p.keyNorm === "pageup" &&
            (eventKey === "prior" || eventKey === "pgup")) ||
        (p.keyNorm === "pagedown" &&
            (eventKey === "next" || eventKey === "pgdn"))
    );
}

export function shouldRunBinding(
    binding: KeyBinding,
    e: KeyboardEvent,
): boolean {
    if (!matchesKeyEvent(binding.key, e)) return false;
    if (binding.when && !binding.when()) return false;

    const parsed = parseShortcut(binding.key);
    const allowInInput =
        binding.allowInInput ?? parsed.hasModifierOrFunctionKey;

    if (!allowInInput && isTextInput(e.target as Element | null)) {
        return false;
    }
    return true;
}

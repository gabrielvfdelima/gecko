/**
 * Utilitários de foco para navegação por teclado no Gecko.
 * Filtra elementos realmente visíveis, interativos e habilitados,
 * evitando armadilhas de elementos ocultos (.hidden, display: none, inert).
 */

const FOCUSABLE_SELECTOR = [
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    "textarea:not([disabled])",
    "button:not([disabled])",
    'a[href]:not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
    '[contenteditable="true"]:not([tabindex="-1"])',
].join(", ");

/**
 * Verifica se um elemento HTML está visível na árvore DOM e disponível para foco.
 */
export function isElementVisible(el: HTMLElement | null): boolean {
    if (!el || !el.isConnected) return false;
    if (el.hasAttribute("disabled") || el.hasAttribute("inert")) return false;
    if (el.dataset.focusSkip === "true") return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.closest(".hidden, [inert], [aria-hidden='true']")) return false;

    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;

    const rects = el.getClientRects();
    return rects.length > 0;
}

/**
 * Retorna a lista ordenada de elementos focáveis dentro de `root` que estão visíveis.
 */
export function getFocusable(root: ParentNode): HTMLElement[] {
    const candidates = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    return candidates.filter((el) => {
        if (el.tabIndex < 0) return false;
        return isElementVisible(el);
    });
}

/**
 * Verifica se o elemento é um campo de edição de texto (input, textarea, CodeMirror).
 */
export function isTextInput(el: Element | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
        const type = (el as HTMLInputElement).type.toLowerCase();
        return ![
            "button",
            "checkbox",
            "radio",
            "submit",
            "reset",
            "file",
            "range",
            "color",
        ].includes(type);
    }
    if (el.isContentEditable) return true;
    if (el.closest(".cm-content, .cm-editor")) return true;
    return false;
}

/**
 * Foca um elemento de forma segura, opcionalmente no próximo frame.
 */
export function focusSafely(
    el: HTMLElement | null | undefined,
    options?: { preventScroll?: boolean; defer?: boolean },
): boolean {
    if (!el) return false;
    const doFocus = () => {
        if (!el.isConnected) return;
        try {
            el.focus({ preventScroll: options?.preventScroll ?? true });
        } catch {
            // ignore
        }
    };
    if (options?.defer) {
        requestAnimationFrame(doFocus);
        return true;
    }
    if (!el.isConnected) return false;
    doFocus();
    return document.activeElement === el || el.contains(document.activeElement);
}

/**
 * Guarda a referência do elemento focado antes de abrir uma camada (modal, menu, quick-open)
 * e restaura o foco de forma resiliente mesmo se o elemento original tiver sido recriado.
 */
export class FocusMemory {
    private savedEl: HTMLElement | null = null;
    private fallbackFn: (() => void) | null = null;

    constructor(fallbackFn?: () => void) {
        const active = document.activeElement;
        this.savedEl = active instanceof HTMLElement ? active : null;
        this.fallbackFn = fallbackFn || null;
    }

    static from(
        originEl?: HTMLElement | null,
        fallbackFn?: () => void,
    ): FocusMemory {
        const mem = new FocusMemory(fallbackFn);
        if (originEl !== undefined) {
            mem.savedEl = originEl;
        }
        return mem;
    }

    getOrigin(): HTMLElement | null {
        return this.savedEl;
    }

    restore(): void {
        const target = this.savedEl;
        this.savedEl = null;

        const runRestore = () => {
            if (target && isElementVisible(target)) {
                target.focus({ preventScroll: true });
                if (document.activeElement === target) return;
            }
            if (this.fallbackFn) {
                this.fallbackFn();
            }
        };

        queueMicrotask(runRestore);
    }
}

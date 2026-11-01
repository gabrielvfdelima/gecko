/**
 * Controlador genérico e reutilizável para navegação por teclado em listas, menus e abas.
 * Suporta:
 * - Orientação vertical (`↑`/`↓`), horizontal (`←`/`→`) ou ambas (`grid`/abas).
 * - Modos de foco:
 *   - `roving`: cada item recebe foco real (`tabIndex = 0` no selecionado, `-1` nos demais). Ideal para barra de abas e menu de contexto.
 *   - `virtual`: o foco permanece em um input/container externo (ex.: Quick Open, Directory Browser, Sidebar Tree), atualizando seleção visual + scrollIntoView + aria-activedescendant.
 * - `Home`, `End`, `PageUp`, `PageDown`.
 * - Busca incremental por digitação (type-ahead) opcional.
 */

export interface ListNavigatorOptions {
    /** Container DOM que envolve os itens */
    container: HTMLElement;
    /** Retorna os elementos DOM correspondentes aos itens navegáveis */
    getItems: () => HTMLElement[];
    /** Orientação das setas de navegação */
    orientation?: "vertical" | "horizontal" | "both";
    /**
     * Modo de gerenciamento de foco:
     * - "roving": move `.focus()` e `tabIndex=0` para o item ativo.
     * - "virtual": mantém o foco onde está e aplica classe `.selected` + scrollIntoView.
     */
    mode?: "roving" | "virtual";
    /** Se `true` (padrão), volta ao início ao passar do último item e vice-versa */
    wrap?: boolean;
    /** Quantidade de itens pulados em PageUp/PageDown (padrão: 6) */
    pageSize?: number;
    /** Habilita salto rápido ao digitar letras (útil quando o foco não está em um input de filtro) */
    typeAhead?: boolean;
    /** Extrai o texto de um item para o type-ahead */
    getItemText?: (el: HTMLElement, index: number) => string;
    /**Verifica se um item específico está desabilitado/não-selecionável */
    isItemDisabled?: (el: HTMLElement, index: number) => boolean;
    /** Classe CSS aplicada ao item selecionado (padrão: "selected") */
    selectedClass?: string;
    /** Callback disparado sempre que o índice ativo muda */
    onSelect?: (index: number, el: HTMLElement | undefined, viaKeyboard: boolean) => void;
    /** Callback disparado ao pressionar Enter (ou Space quando não estiver em input) */
    onActivate?: (index: number, el: HTMLElement | undefined, e: KeyboardEvent) => void;
}

export interface ListNavigator {
    getIndex: () => number;
    setIndex: (index: number, options?: { focus?: boolean; notify?: boolean; scroll?: boolean }) => void;
    move: (delta: number, viaKeyboard?: boolean) => void;
    first: (viaKeyboard?: boolean) => void;
    last: (viaKeyboard?: boolean) => void;
    pageUp: () => void;
    pageDown: () => void;
    activateCurrent: (e: KeyboardEvent) => boolean;
    handleKeyDown: (e: KeyboardEvent) => boolean;
    refreshRovingTabIndex: () => void;
}

export function createListNavigator(
    opts: ListNavigatorOptions,
): ListNavigator {
    const orientation = opts.orientation ?? "vertical";
    const mode = opts.mode ?? "virtual";
    const wrap = opts.wrap ?? true;
    const pageSize = opts.pageSize ?? 6;
    const selectedClass = opts.selectedClass ?? "selected";

    let activeIndex = 0;
    let typeAheadBuffer = "";
    let typeAheadTimer: ReturnType<typeof setTimeout> | null = null;

    const isEnabled = (items: HTMLElement[], idx: number): boolean => {
        const el = items[idx];
        if (!el) return false;
        if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
            return false;
        }
        if (opts.isItemDisabled && opts.isItemDisabled(el, idx)) {
            return false;
        }
        return true;
    };

    const findValidIndex = (
        items: HTMLElement[],
        startIdx: number,
        step: 1 | -1,
    ): number => {
        const len = items.length;
        if (len === 0) return -1;

        let idx = startIdx;
        for (let i = 0; i < len; i++) {
            if (idx < 0) {
                idx = wrap ? len - 1 : 0;
            } else if (idx >= len) {
                idx = wrap ? 0 : len - 1;
            }
            if (isEnabled(items, idx)) {
                return idx;
            }
            if (!wrap && (idx === 0 || idx === len - 1)) {
                break;
            }
            idx += step;
        }
        return -1;
    };

    const applyVisualAndFocus = (
        items: HTMLElement[],
        idx: number,
        options?: { focus?: boolean; notify?: boolean; scroll?: boolean; viaKeyboard?: boolean },
    ) => {
        const shouldScroll = options?.scroll ?? true;
        const shouldFocus = options?.focus ?? mode === "roving";
        const shouldNotify = options?.notify ?? true;

        items.forEach((el, i) => {
            const isSel = i === idx;
            if (selectedClass) {
                el.classList.toggle(selectedClass, isSel);
            }
            if (mode === "roving") {
                el.tabIndex = isSel ? 0 : -1;
            }
            if (el.getAttribute("role") === "option" || el.getAttribute("role") === "tab" || el.getAttribute("role") === "treeitem") {
                el.setAttribute("aria-selected", String(isSel));
            }
        });

        const currentEl = items[idx];
        if (currentEl) {
            if (shouldScroll) {
                currentEl.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
            if (shouldFocus) {
                currentEl.focus({ preventScroll: true });
            }
        }

        if (shouldNotify && opts.onSelect) {
            opts.onSelect(idx, currentEl, options?.viaKeyboard ?? false);
        }
    };

    const setIndex = (
        index: number,
        options?: { focus?: boolean; notify?: boolean; scroll?: boolean },
    ) => {
        const items = opts.getItems();
        if (items.length === 0) {
            activeIndex = 0;
            return;
        }
        const clamped = Math.max(0, Math.min(items.length - 1, index));
        const valid = isEnabled(items, clamped)
            ? clamped
            : findValidIndex(items, clamped, 1);
        activeIndex = valid >= 0 ? valid : 0;
        applyVisualAndFocus(items, activeIndex, options);
    };

    const move = (delta: number, viaKeyboard = true) => {
        const items = opts.getItems();
        if (items.length === 0) return;

        const step: 1 | -1 = delta >= 0 ? 1 : -1;
        const stepsCount = Math.abs(delta);
        let nextIdx = activeIndex;

        for (let s = 0; s < stepsCount; s++) {
            const candidate = nextIdx + step;
            if (!wrap && (candidate < 0 || candidate >= items.length)) {
                break;
            }
            const found = findValidIndex(items, candidate, step);
            if (found === -1) break;
            nextIdx = found;
        }

        activeIndex = nextIdx;
        applyVisualAndFocus(items, activeIndex, { viaKeyboard });
    };

    const first = (viaKeyboard = true) => {
        const items = opts.getItems();
        if (items.length === 0) return;
        const found = findValidIndex(items, 0, 1);
        if (found >= 0) {
            activeIndex = found;
            applyVisualAndFocus(items, activeIndex, { viaKeyboard });
        }
    };

    const last = (viaKeyboard = true) => {
        const items = opts.getItems();
        if (items.length === 0) return;
        const found = findValidIndex(items, items.length - 1, -1);
        if (found >= 0) {
            activeIndex = found;
            applyVisualAndFocus(items, activeIndex, { viaKeyboard });
        }
    };

    const pageUp = () => {
        const items = opts.getItems();
        if (items.length === 0) return;
        const target = Math.max(0, activeIndex - pageSize);
        const found = findValidIndex(items, target, 1);
        if (found >= 0) {
            activeIndex = found;
            applyVisualAndFocus(items, activeIndex, { viaKeyboard: true });
        }
    };

    const pageDown = () => {
        const items = opts.getItems();
        if (items.length === 0) return;
        const target = Math.min(items.length - 1, activeIndex + pageSize);
        const found = findValidIndex(items, target, -1);
        if (found >= 0) {
            activeIndex = found;
            applyVisualAndFocus(items, activeIndex, { viaKeyboard: true });
        }
    };

    const activateCurrent = (e: KeyboardEvent): boolean => {
        const items = opts.getItems();
        if (items.length === 0) return false;
        const currentEl = items[activeIndex];
        if (!currentEl || !isEnabled(items, activeIndex)) return false;
        if (opts.onActivate) {
            opts.onActivate(activeIndex, currentEl, e);
            return true;
        }
        currentEl.click();
        return true;
    };

    const handleTypeAhead = (char: string): boolean => {
        const items = opts.getItems();
        if (items.length === 0) return false;

        if (typeAheadTimer) clearTimeout(typeAheadTimer);
        typeAheadBuffer += char.toLowerCase();
        typeAheadTimer = setTimeout(() => {
            typeAheadBuffer = "";
        }, 500);

        const getText =
            opts.getItemText ??
            ((el: HTMLElement) => (el.textContent || "").trim());

        const start = (activeIndex + 1) % items.length;
        for (let offset = 0; offset < items.length; offset++) {
            const idx = (start + offset) % items.length;
            if (!isEnabled(items, idx)) continue;
            const label = getText(items[idx], idx).toLowerCase();
            if (label.startsWith(typeAheadBuffer)) {
                activeIndex = idx;
                applyVisualAndFocus(items, activeIndex, { viaKeyboard: true });
                return true;
            }
        }
        return false;
    };

    const handleKeyDown = (e: KeyboardEvent): boolean => {
        const allowVert =
            orientation === "vertical" || orientation === "both";
        const allowHoriz =
            orientation === "horizontal" || orientation === "both";

        if (allowVert && e.key === "ArrowDown" && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            move(1, true);
            return true;
        }
        if (allowVert && e.key === "ArrowUp" && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            move(-1, true);
            return true;
        }
        if (allowHoriz && e.key === "ArrowRight" && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            move(1, true);
            return true;
        }
        if (allowHoriz && e.key === "ArrowLeft" && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            move(-1, true);
            return true;
        }
        if (e.key === "PageDown" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            pageDown();
            return true;
        }
        if (e.key === "PageUp" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            pageUp();
            return true;
        }
        if (e.key === "Home" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            first(true);
            return true;
        }
        if (e.key === "End" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            last(true);
            return true;
        }
        if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (activateCurrent(e)) {
                e.preventDefault();
                e.stopPropagation();
                return true;
            }
        }
        if (
            opts.typeAhead &&
            e.key.length === 1 &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            e.key !== " "
        ) {
            if (handleTypeAhead(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                return true;
            }
        }
        return false;
    };

    const refreshRovingTabIndex = () => {
        const items = opts.getItems();
        if (items.length === 0) return;
        const clamped = Math.max(0, Math.min(items.length - 1, activeIndex));
        activeIndex = clamped;
        items.forEach((el, i) => {
            if (mode === "roving") {
                el.tabIndex = i === activeIndex ? 0 : -1;
            }
        });
    };

    return {
        getIndex: () => activeIndex,
        setIndex,
        move,
        first,
        last,
        pageUp,
        pageDown,
        activateCurrent,
        handleKeyDown,
        refreshRovingTabIndex,
    };
}

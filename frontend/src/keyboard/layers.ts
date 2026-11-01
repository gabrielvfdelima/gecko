/**
 * Pilha de camadas modais e sobrepostas (Modal, Quick Open, Context Menu, Popovers).
 *
 * Responsabilidades automáticas de cada camada:
 * 1. Focus Trap (Tab / Shift+Tab) restrito aos elementos realmente visíveis (resolve bug de elementos .hidden).
 * 2. Fechamento ou delegação em `Escape`.
 * 3. Bloqueio de atalhos globais de fundo enquanto uma camada modal está ativa.
 * 4. Restauração resiliente de foco via `FocusMemory`, suportando modais empilhados/encadeados.
 */

import { FocusMemory, getFocusable, isElementVisible } from "./focusUtils";
import { KeyBinding, shouldRunBinding } from "./keybindings";

export type LayerKind = "modal" | "popup";

export interface LayerConfig {
    /** Identificador legível para debug (ex: "modal", "quick-open", "context-menu") */
    id: string;
    /** Elemento raiz da camada onde o foco será contido */
    element: HTMLElement;
    /**
     * "modal": prende Tab/Shift+Tab dentro da camada.
     * "popup": fecha no Tab ou delega conforme configurado.
     */
    kind?: LayerKind;
    /** Elemento ou função que retorna o elemento a receber foco ao abrir */
    initialFocus?: HTMLElement | (() => HTMLElement | null) | null;
    /** Elemento de origem explícito para restaurar foco ao fechar */
    restoreFocusTo?: HTMLElement | null;
    /** Callback de fallback caso o elemento original não exista mais ao fechar */
    restoreFallback?: () => void;
    /** Callback disparado ao pressionar Escape. Retorne `true` se o Escape foi consumido internamente sem fechar a camada. */
    onEscape?: (e: KeyboardEvent) => boolean | void;
    /** Atalhos de teclado específicos desta camada (avaliados antes do trap padrão) */
    bindings?: KeyBinding[];
    /** Handler livre opcional para teclas complexas da camada */
    onKeyDown?: (e: KeyboardEvent) => boolean | void;
    /** Se `true` (padrão), bloqueia os atalhos globais do workbench enquanto a camada estiver aberta */
    blockGlobalShortcuts?: boolean;
    /** Se `true`, fecha a camada quando Tab é pressionado (útil para context-menu) */
    closeOnTab?: (e: KeyboardEvent) => void;
}

export interface ActiveLayer {
    readonly id: string;
    readonly element: HTMLElement;
    /** Fecha a camada e restaura o foco anterior (a menos que `restoreFocus: false`) */
    close: (options?: { restoreFocus?: boolean }) => void;
    /** Atualiza os bindings ou callbacks da camada em tempo de execução */
    updateBindings: (bindings: KeyBinding[]) => void;
}

interface InternalLayer extends LayerConfig {
    focusMemory: FocusMemory;
    handle: ActiveLayer;
}

const layerStack: InternalLayer[] = [];

/**
 * Empilha uma nova camada interativa no topo e aplica foco inicial no próximo frame.
 */
export function pushLayer(config: LayerConfig): ActiveLayer {
    // Se já existir camada com mesmo id, remove a anterior sem restaurar foco intermediário
    const existingIdx = layerStack.findIndex((l) => l.id === config.id);
    let inheritedOrigin: HTMLElement | null | undefined = config.restoreFocusTo;

    if (existingIdx !== -1) {
        const [removed] = layerStack.splice(existingIdx, 1);
        if (inheritedOrigin === undefined) {
            inheritedOrigin = removed.focusMemory.getOrigin();
        }
    } else if (inheritedOrigin === undefined && layerStack.length > 0) {
        // Caso um modal substitua/encadeie outro, se o foco atual estiver dentro de outra camada que está fechando,
        // preserva o origin real se passado, ou usa o activeElement atual.
        const active = document.activeElement as HTMLElement | null;
        if (active && isElementVisible(active)) {
            inheritedOrigin = active;
        }
    }

    const focusMemory = FocusMemory.from(
        inheritedOrigin,
        config.restoreFallback,
    );

    const internal: InternalLayer = {
        ...config,
        kind: config.kind ?? "modal",
        blockGlobalShortcuts: config.blockGlobalShortcuts ?? true,
        focusMemory,
        handle: {
            id: config.id,
            element: config.element,
            close: (opts) => {
                const idx = layerStack.indexOf(internal);
                if (idx === -1) return;
                layerStack.splice(idx, 1);
                if (opts?.restoreFocus !== false) {
                    // Se ainda há outra camada abaixo na pilha, foca dentro dela
                    const nextTop = layerStack[layerStack.length - 1];
                    if (nextTop) {
                        focusLayerInitial(nextTop);
                    } else {
                        internal.focusMemory.restore();
                    }
                }
            },
            updateBindings: (bindings: KeyBinding[]) => {
                internal.bindings = bindings;
            },
        },
    };

    layerStack.push(internal);
    focusLayerInitial(internal);

    return internal.handle;
}

function focusLayerInitial(layer: InternalLayer): void {
    const applyFocus = () => {
        if (!layerStack.includes(layer)) return;
        let target: HTMLElement | null = null;
        if (typeof layer.initialFocus === "function") {
            target = layer.initialFocus();
        } else if (layer.initialFocus) {
            target = layer.initialFocus;
        }

        if (!target || !isElementVisible(target)) {
            const focusables = getFocusable(layer.element);
            target = focusables[0] || layer.element;
        }

        if (target && target.isConnected) {
            target.focus({ preventScroll: true });
        }
    };

    queueMicrotask(applyFocus);
    requestAnimationFrame(applyFocus);
}

/**
 * Retorna a camada no topo da pilha, ou `null` se nenhuma estiver aberta.
 */
export function getTopLayer(): InternalLayer | null {
    return layerStack.length > 0 ? layerStack[layerStack.length - 1] : null;
}

/**
 * Verifica se há alguma camada ativa.
 */
export function hasActiveLayer(id?: string): boolean {
    if (!id) return layerStack.length > 0;
    return layerStack.some((l) => l.id === id);
}

/**
 * Processa eventos de teclado para a camada do topo.
 * Retorna `true` se o evento foi interceptado ou bloqueado pela camada.
 */
export function handleLayerKeyDown(e: KeyboardEvent): boolean {
    // Limpa camadas cujo elemento foi desconectado ou ocultado externamente
    while (layerStack.length > 0) {
        const top = layerStack[layerStack.length - 1];
        if (!top.element.isConnected || top.element.classList.contains("hidden") || top.element.closest(".hidden")) {
            layerStack.pop();
        } else {
            break;
        }
    }

    const top = getTopLayer();
    if (!top) return false;

    const active = document.activeElement as HTMLElement | null;

    // 1. Escape
    if (e.key === "Escape") {
        // Se um input interno tem tratamento próprio de Escape (ex.: criação inline de pasta no browser)
        if (active?.dataset.customEscape === "true") {
            return true; // deixa o listener do próprio input tratar, mas bloqueia global
        }
        if (top.onEscape) {
            e.preventDefault();
            e.stopPropagation();
            top.onEscape(e);
            return true;
        }
    }

    // 2. Handler customizado da camada (onKeyDown)
    if (top.onKeyDown) {
        const res = top.onKeyDown(e);
        if (res === true) {
            return true;
        }
    }

    // 3. Bindings declarativos da camada
    if (top.bindings && top.bindings.length > 0) {
        for (const b of top.bindings) {
            if (shouldRunBinding(b, e)) {
                const res = b.run(e);
                if (res !== false) {
                    if (b.preventDefault !== false) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    return true;
                }
            }
        }
    }

    // 4. Trap de Tab / Shift+Tab
    if (e.key === "Tab") {
        if (top.kind === "popup" && top.closeOnTab) {
            e.preventDefault();
            e.stopPropagation();
            top.closeOnTab(e);
            return true;
        }

        e.preventDefault();
        e.stopPropagation();
        const focusables = getFocusable(top.element);
        if (focusables.length === 0) return true;

        const currentIdx = active ? focusables.indexOf(active) : -1;
        if (e.shiftKey) {
            const prevIdx =
                currentIdx <= 0 ? focusables.length - 1 : currentIdx - 1;
            focusables[prevIdx].focus();
        } else {
            const nextIdx =
                currentIdx === -1 || currentIdx >= focusables.length - 1
                    ? 0
                    : currentIdx + 1;
            focusables[nextIdx].focus();
        }
        return true;
    }

    // 5. Bloqueia atalhos globais de fundo enquanto a camada estiver ativa,
    // mas deixa teclas normais (digitação nos inputs da camada) seguirem para o target.
    return Boolean(top.blockGlobalShortcuts);
}

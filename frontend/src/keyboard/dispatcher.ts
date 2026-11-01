/**
 * Dispatcher central de teclado do Gecko.
 *
 * Mantém um ÚNICO listener global `keydown` (fase de captura) com ordem de prioridade clara:
 * 1. Camada ativa no topo da pilha (`layers.ts`: Modal, Quick Open, Context Menu).
 * 2. Atalhos globais registrados (`registerKeybinding`).
 * 3. Listeners locais de componentes (Sidebar, Barra de Abas, CodeMirror 6).
 */

import { KeyBinding, shouldRunBinding } from "./keybindings";
import { handleLayerKeyDown } from "./layers";

const globalBindings: KeyBinding[] = [];
let dispatcherInitialized = false;

/**
 * Registra um ou mais atalhos globais do workbench.
 * Retorna uma função `dispose()` para remover os atalhos caso necessário.
 */
export function registerKeybindings(bindings: KeyBinding[]): () => void {
    globalBindings.push(...bindings);
    return () => {
        for (const b of bindings) {
            const idx = globalBindings.indexOf(b);
            if (idx !== -1) globalBindings.splice(idx, 1);
        }
    };
}

export function registerKeybinding(binding: KeyBinding): () => void {
    return registerKeybindings([binding]);
}

/**
 * Inicializa o listener único em `window` (capture = true).
 */
export function initKeyboardDispatcher(): void {
    if (dispatcherInitialized) return;
    dispatcherInitialized = true;

    window.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
            // 1. Se houver qualquer camada aberta (modal, quick-open, context-menu),
            // a camada decide se consome a tecla ou se apenas bloqueia os atalhos globais.
            if (handleLayerKeyDown(e)) {
                return;
            }

            // 2. Avalia atalhos globais registrados
            for (const binding of globalBindings) {
                if (shouldRunBinding(binding, e)) {
                    const result = binding.run(e);
                    if (result !== false) {
                        if (binding.preventDefault !== false) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        return;
                    }
                }
            }
        },
        true,
    );
}

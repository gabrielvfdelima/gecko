/**
 * Registro e navegação entre as regiões persistentes do Workbench do Gecko
 * (Sidebar, Barra de Abas, Editor/Empty-State, Barra de Status).
 *
 * Permite ciclar o foco entre áreas via `F6` e `Shift+F6` (padrão de editores e navegadores),
 * resolvendo a saída do editor sem comprometer o `Tab` de indentação.
 */

export interface WorkbenchRegion {
    /** Identificador único da região: "sidebar", "tabs", "editor", "status" */
    id: string;
    /** Ordem numérica no ciclo F6 */
    order: number;
    /** Elemento raiz da região (para detectar qual região contém o activeElement atual) */
    getRoot: () => HTMLElement | null;
    /** Verifica se a região está visível e tem itens focáveis no momento */
    isAvailable: () => boolean;
    /** Move o foco para o elemento principal da região */
    focus: () => void;
}

const regions: WorkbenchRegion[] = [];

export function registerRegion(region: WorkbenchRegion): () => void {
    const existingIdx = regions.findIndex((r) => r.id === region.id);
    if (existingIdx !== -1) {
        regions.splice(existingIdx, 1);
    }
    regions.push(region);
    regions.sort((a, b) => a.order - b.order);

    return () => {
        const idx = regions.indexOf(region);
        if (idx !== -1) regions.splice(idx, 1);
    };
}

export function getActiveRegionId(): string | null {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return null;
    for (const r of regions) {
        const root = r.getRoot();
        if (root && (root === active || root.contains(active))) {
            return r.id;
        }
    }
    return null;
}

export function focusRegion(id: string): boolean {
    const target = regions.find((r) => r.id === id);
    if (!target || !target.isAvailable()) return false;
    target.focus();
    return true;
}

/**
 * Avança (`direction = 1`) ou retrocede (`direction = -1`) entre as regiões disponíveis do workbench.
 */
export function cycleWorkbenchRegion(direction: 1 | -1): boolean {
    const available = regions.filter((r) => r.isAvailable());
    if (available.length === 0) return false;

    const currentId = getActiveRegionId();
    const currentIdx = currentId
        ? available.findIndex((r) => r.id === currentId)
        : -1;

    let nextIdx: number;
    if (currentIdx === -1) {
        nextIdx = direction === 1 ? 0 : available.length - 1;
    } else {
        nextIdx =
            (currentIdx + direction + available.length) % available.length;
    }

    available[nextIdx].focus();
    return true;
}

import { GECKO_SHORTCUT_SECTIONS, ShortcutItem, ShortcutSection } from "./shortcutsData";

export interface ShortcutsModalController {
    bodyEl: HTMLElement;
    actionsEl: HTMLElement;
    initialFocusEl: HTMLElement;
}

export function createShortcutsModal(onClose: () => void): ShortcutsModalController {
    const root = document.createElement("div");
    root.className = "shortcuts-modal-root";

    // Header / Search Bar
    const searchBar = document.createElement("div");
    searchBar.className = "shortcuts-search-bar";

    const searchIcon = document.createElement("span");
    searchIcon.className = "shortcuts-search-icon";
    searchIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="7" cy="7" r="4.5" />
        <line x1="10.5" y1="10.5" x2="14" y2="14" />
    </svg>`;

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "shortcuts-search-input";
    searchInput.placeholder = "Pesquisar por ação, tecla ou categoria (ex: salvar, f6, markdown)...";
    searchInput.setAttribute("aria-label", "Pesquisar atalhos");
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;

    const counterBadge = document.createElement("span");
    counterBadge.className = "shortcuts-counter-badge";

    searchBar.appendChild(searchIcon);
    searchBar.appendChild(searchInput);
    searchBar.appendChild(counterBadge);
    root.appendChild(searchBar);

    // Scrollable content area
    const scrollContainer = document.createElement("div");
    scrollContainer.className = "shortcuts-scroll-container";
    scrollContainer.tabIndex = 0;
    scrollContainer.setAttribute("role", "region");
    scrollContainer.setAttribute("aria-label", "Lista de atalhos de teclado");
    root.appendChild(scrollContainer);

    function formatKeyBadge(keyString: string): HTMLElement {
        const wrap = document.createElement("span");
        wrap.className = "shortcuts-combo";

        // Splits key combination e.g. "Ctrl + Shift + W" or "Ctrl + /"
        const tokens = keyString.split(/\s*\+\s*/);
        for (let i = 0; i < tokens.length; i++) {
            if (i > 0) {
                const plus = document.createElement("span");
                plus.className = "shortcuts-plus";
                plus.textContent = "+";
                wrap.appendChild(plus);
            }
            const kbd = document.createElement("kbd");
            kbd.className = "gecko-kbd";
            kbd.textContent = tokens[i];
            wrap.appendChild(kbd);
        }
        return wrap;
    }

    function renderList(query = ""): void {
        const q = query.trim().toLowerCase();
        scrollContainer.innerHTML = "";

        let totalRendered = 0;

        for (const section of GECKO_SHORTCUT_SECTIONS) {
            const matches: ShortcutItem[] = section.shortcuts.filter((item) => {
                if (!q) return true;
                const matchLabel = item.label.toLowerCase().includes(q);
                const matchDesc = item.description ? item.description.toLowerCase().includes(q) : false;
                const matchKeys = item.keys.some((k) =>
                    k.toLowerCase().replace(/\s+/g, "").includes(q.replace(/\s+/g, ""))
                );
                const matchSection = section.title.toLowerCase().includes(q);
                return matchLabel || matchDesc || matchKeys || matchSection;
            });

            if (matches.length === 0) continue;
            totalRendered += matches.length;

            const sectionEl = document.createElement("section");
            sectionEl.className = "shortcuts-section";

            const headerEl = document.createElement("header");
            headerEl.className = "shortcuts-section-header";

            const titleEl = document.createElement("h3");
            titleEl.className = "shortcuts-section-title";
            titleEl.textContent = section.title;

            const countEl = document.createElement("span");
            countEl.className = "shortcuts-section-count";
            countEl.textContent = `${matches.length}`;

            headerEl.appendChild(titleEl);
            headerEl.appendChild(countEl);
            sectionEl.appendChild(headerEl);

            const listEl = document.createElement("div");
            listEl.className = "shortcuts-list";

            for (const item of matches) {
                const row = document.createElement("div");
                row.className = "shortcuts-row";

                const infoCol = document.createElement("div");
                infoCol.className = "shortcuts-info-col";

                const labelEl = document.createElement("div");
                labelEl.className = "shortcuts-row-label";
                labelEl.textContent = item.label;
                infoCol.appendChild(labelEl);

                if (item.description) {
                    const descEl = document.createElement("div");
                    descEl.className = "shortcuts-row-desc";
                    descEl.textContent = item.description;
                    infoCol.appendChild(descEl);
                }

                const keysCol = document.createElement("div");
                keysCol.className = "shortcuts-keys-col";

                for (let k = 0; k < item.keys.length; k++) {
                    if (k > 0) {
                        const orEl = document.createElement("span");
                        orEl.className = "shortcuts-or-sep";
                        orEl.textContent = "ou";
                        keysCol.appendChild(orEl);
                    }
                    keysCol.appendChild(formatKeyBadge(item.keys[k]));
                }

                row.appendChild(infoCol);
                row.appendChild(keysCol);
                listEl.appendChild(row);
            }

            sectionEl.appendChild(listEl);
            scrollContainer.appendChild(sectionEl);
        }

        if (totalRendered === 0) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "shortcuts-empty-state";
            emptyEl.textContent = `Nenhum atalho encontrado para "${query}".`;
            scrollContainer.appendChild(emptyEl);
            counterBadge.textContent = "0 resultados";
        } else {
            counterBadge.textContent = q ? `${totalRendered} encontrado(s)` : `${totalRendered} atalhos`;
        }
    }

    searchInput.addEventListener("input", () => {
        renderList(searchInput.value);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            scrollContainer.focus();
        } else if (e.key === "PageDown") {
            e.preventDefault();
            scrollContainer.scrollBy({ top: 200, behavior: "auto" });
        } else if (e.key === "PageUp") {
            e.preventDefault();
            scrollContainer.scrollBy({ top: -200, behavior: "auto" });
        }
    });

    scrollContainer.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            scrollContainer.scrollBy({ top: 40, behavior: "auto" });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (scrollContainer.scrollTop <= 0) {
                searchInput.focus();
            } else {
                scrollContainer.scrollBy({ top: -40, behavior: "auto" });
            }
        } else if (e.key === "PageDown") {
            e.preventDefault();
            scrollContainer.scrollBy({ top: 200, behavior: "auto" });
        } else if (e.key === "PageUp") {
            e.preventDefault();
            scrollContainer.scrollBy({ top: -200, behavior: "auto" });
        } else if (e.key === "Home") {
            e.preventDefault();
            scrollContainer.scrollTo({ top: 0, behavior: "auto" });
        } else if (e.key === "End") {
            e.preventDefault();
            scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "auto" });
        }
    });

    // Initial render of all shortcuts
    renderList("");

    // Bottom Action Bar
    const actionsEl = document.createElement("div");
    actionsEl.className = "shortcuts-modal-actions";

    const tipSpan = document.createElement("span");
    tipSpan.className = "shortcuts-footer-tip";
    tipSpan.textContent = "Dica: Você pode abrir este mapa a qualquer momento pressionando F1 ou Ctrl + /";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "action-btn primary";
    closeBtn.textContent = "Fechar (Esc)";
    closeBtn.addEventListener("click", () => onClose());

    actionsEl.appendChild(tipSpan);
    actionsEl.appendChild(closeBtn);

    return {
        bodyEl: root,
        actionsEl,
        initialFocusEl: searchInput,
    };
}

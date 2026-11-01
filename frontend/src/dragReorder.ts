export type TabDropPosition = 'before' | 'after';
export type TreeDropPosition = 'before' | 'after' | 'into';

export interface TabDragOptions {
  container: HTMLElement;
  onReorder: (
    sourcePath: string,
    targetPath: string,
    position: TabDropPosition
  ) => void;
}

export interface TreeDragOptions {
  container: HTMLElement;
  onDrop: (
    sourcePath: string,
    sourceIsDir: boolean,
    targetPath: string,
    targetIsDir: boolean,
    position: TreeDropPosition
  ) => void;
  onAutoExpandDir?: (dirPath: string) => void;
}

const DRAG_THRESHOLD_PX = 4;

/**
 * Attaches lightweight pointer-based drag-and-drop reordering for top bar tabs.
 */
export function attachTabPointerDrag(options: TabDragOptions): void {
  const { container, onReorder } = options;

  let sourceEl: HTMLElement | null = null;
  let sourcePath = '';
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let currentTargetEl: HTMLElement | null = null;
  let currentPos: TabDropPosition = 'before';

  const clearIndicators = () => {
    container
      .querySelectorAll('.tab-item.dragging, .tab-item.drop-before, .tab-item.drop-after')
      .forEach((el) => {
        el.classList.remove('dragging', 'drop-before', 'drop-after');
      });
  };

  const cleanup = () => {
    document.body.classList.remove('is-dragging-tabs');
    window.getSelection()?.removeAllRanges();
    clearIndicators();
    sourceEl = null;
    sourcePath = '';
    currentTargetEl = null;
    isDragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown, true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isDragging) {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!sourceEl) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!isDragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      isDragging = true;
      sourceEl.classList.add('dragging');
      document.body.classList.add('is-dragging-tabs');
      window.getSelection()?.removeAllRanges();
    }

    if (isDragging) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
    }

    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const tabEl = hit ? (hit.closest('.tab-item') as HTMLElement | null) : null;

    if (currentTargetEl) {
      currentTargetEl.classList.remove('drop-before', 'drop-after');
      currentTargetEl = null;
    }

    if (!tabEl || tabEl === sourceEl || !container.contains(tabEl)) {
      return;
    }

    const rect = tabEl.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    currentPos = e.clientX < midX ? 'before' : 'after';
    currentTargetEl = tabEl;
    tabEl.classList.add(
      currentPos === 'before' ? 'drop-before' : 'drop-after'
    );
  };

  const onPointerUp = () => {
    if (isDragging && currentTargetEl && sourcePath) {
      const targetPath = currentTargetEl.dataset.path || '';
      const pos = currentPos;
      const src = sourcePath;
      cleanup();
      if (targetPath && targetPath !== src) {
        onReorder(src, targetPath, pos);
      }
      return;
    }
    cleanup();
  };

  container.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.tab-action-btn') || target.closest('input')) {
      return;
    }

    const tabEl = target.closest('.tab-item') as HTMLElement | null;
    if (!tabEl || !tabEl.dataset.path) return;

    window.getSelection()?.removeAllRanges();
    sourceEl = tabEl;
    sourcePath = tabEl.dataset.path;
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown, true);
  });
}

/**
 * Attaches lightweight pointer-based drag-and-drop for sidebar file/folder rows.
 */
export function attachTreePointerDrag(options: TreeDragOptions): void {
  const { container, onDrop, onAutoExpandDir } = options;

  let sourceEl: HTMLElement | null = null;
  let sourcePath = '';
  let sourceWsRoot = '';
  let sourceIsDir = false;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let currentTargetEl: HTMLElement | null = null;
  let currentPos: TreeDropPosition = 'before';
  let hoverExpandTimer: ReturnType<typeof setTimeout> | null = null;
  let hoverExpandPath = '';

  const clearHoverTimer = () => {
    if (hoverExpandTimer !== null) {
      clearTimeout(hoverExpandTimer);
      hoverExpandTimer = null;
    }
    hoverExpandPath = '';
  };

  const clearIndicators = () => {
    container
      .querySelectorAll(
        '.tree-row.dragging, .tree-row.drop-before, .tree-row.drop-after, .tree-row.drop-into'
      )
      .forEach((el) => {
        el.classList.remove(
          'dragging',
          'drop-before',
          'drop-after',
          'drop-into'
        );
      });
  };

  const cleanup = () => {
    clearHoverTimer();
    clearIndicators();
    document.body.classList.remove('is-dragging-tree');
    sourceEl = null;
    sourcePath = '';
    sourceWsRoot = '';
    sourceIsDir = false;
    currentTargetEl = null;
    isDragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown, true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isDragging) {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!sourceEl) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!isDragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      isDragging = true;
      sourceEl.classList.add('dragging');
      document.body.classList.add('is-dragging-tree');
      window.getSelection()?.removeAllRanges();
    }

    e.preventDefault();

    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const rowEl = hit ? (hit.closest('.tree-row') as HTMLElement | null) : null;

    if (currentTargetEl) {
      currentTargetEl.classList.remove(
        'drop-before',
        'drop-after',
        'drop-into'
      );
      currentTargetEl = null;
    }

    if (!rowEl || rowEl === sourceEl || !container.contains(rowEl)) {
      clearHoverTimer();
      return;
    }

    const targetPath = rowEl.dataset.path || '';
    const targetWsRoot = rowEl.dataset.wsroot || '';
    const targetIsDir = rowEl.dataset.isdir === 'true';
    if (!targetPath || (sourceWsRoot && targetWsRoot && sourceWsRoot !== targetWsRoot)) {
      clearHoverTimer();
      return;
    }

    // Prevent dropping a folder into itself or any of its descendants
    if (
      sourceIsDir &&
      (targetPath === sourcePath || targetPath.startsWith(sourcePath + '/'))
    ) {
      clearHoverTimer();
      return;
    }

    const rect = rowEl.getBoundingClientRect();
    const relY = (e.clientY - rect.top) / Math.max(1, rect.height);

    let resolvedTargetEl: HTMLElement = rowEl;
    let resolvedPos: TreeDropPosition;

    if (rowEl.classList.contains('tree-workspace-header')) {
      resolvedPos = 'into';
    } else if (targetIsDir) {
      if (relY < 0.25) {
        resolvedPos = 'before';
      } else if (relY > 0.75) {
        resolvedPos = 'after';
      } else {
        resolvedPos = 'into';
      }
    } else {
      resolvedPos = relY < 0.5 ? 'before' : 'after';
    }

    // Normalize boundary between two adjacent sibling items in the same parent folder
    // so there is only ONE drop line between item[i] and item[i+1]
    if (resolvedPos === 'before') {
      const prevEl = resolvedTargetEl.previousElementSibling as HTMLElement | null;
      if (
        prevEl &&
        prevEl.classList.contains('tree-row') &&
        !prevEl.classList.contains('tree-workspace-header') &&
        prevEl.dataset.parent === resolvedTargetEl.dataset.parent
      ) {
        resolvedTargetEl = prevEl;
        resolvedPos = 'after';
      }
    }

    // Suppress no-op drop indicators (dropping right before/after the dragged item itself in the same folder)
    const sameParentAsSource =
      resolvedTargetEl.dataset.parent === sourceEl.dataset.parent;
    if (resolvedTargetEl === sourceEl) {
      clearHoverTimer();
      return;
    }
    if (
      sameParentAsSource &&
      ((resolvedPos === 'after' &&
        resolvedTargetEl.nextElementSibling === sourceEl) ||
        (resolvedPos === 'before' &&
          resolvedTargetEl.previousElementSibling === sourceEl))
    ) {
      clearHoverTimer();
      return;
    }

    currentTargetEl = resolvedTargetEl;
    currentPos = resolvedPos;
    currentTargetEl.classList.add(`drop-${currentPos}`);

    if (currentPos === 'into' && targetIsDir && onAutoExpandDir) {
      if (hoverExpandPath !== targetPath) {
        clearHoverTimer();
        hoverExpandPath = targetPath;
        hoverExpandTimer = setTimeout(() => {
          hoverExpandTimer = null;
          onAutoExpandDir(targetPath);
        }, 600);
      }
    } else {
      clearHoverTimer();
    }
  };

  const onPointerUp = () => {
    if (isDragging && currentTargetEl && sourcePath) {
      const targetPath = currentTargetEl.dataset.path || '';
      const targetIsDir = currentTargetEl.dataset.isdir === 'true';
      const pos = currentPos;
      const srcPath = sourcePath;
      const srcIsDir = sourceIsDir;
      cleanup();

      if (targetPath && targetPath !== srcPath) {
        onDrop(srcPath, srcIsDir, targetPath, targetIsDir, pos);
      }
      return;
    }
    cleanup();
  };

  container.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (!target || target.closest('input') || target.closest('.ws-actions')) return;

    const rowEl = target.closest('.tree-row') as HTMLElement | null;
    if (!rowEl || !rowEl.dataset.path) return;
    if (rowEl.classList.contains('tree-workspace-header')) return;

    sourceEl = rowEl;
    sourcePath = rowEl.dataset.path;
    sourceWsRoot = rowEl.dataset.wsroot || '';
    sourceIsDir = rowEl.dataset.isdir === 'true';
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown, true);
  });
}

import { useCallback, useEffect, useRef } from 'react';
import { SIDEBAR_LIMITS, useUi } from '../lib/store.js';

/**
 * 6px-wide hover-visible splitter positioned at the right edge of the sidebar.
 * Drag to resize; double-click to snap back to 240 px.
 */
export function SidebarResizer() {
  const setSidebarWidth = useUi((s) => s.setSidebarWidth);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const next = Math.min(SIDEBAR_LIMITS.MAX, Math.max(SIDEBAR_LIMITS.MIN, e.clientX));
      setSidebarWidth(next);
    },
    [setSidebarWidth],
  );

  const stop = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => () => stop(), [stop]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: this is a draggable, pointer-driven splitter with a custom visual handle.
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => setSidebarWidth(240)}
      className="group absolute right-0 top-0 z-20 h-full w-[6px] translate-x-1/2 cursor-col-resize"
      title="Drag to resize · double-click to reset"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition group-hover:w-[2px] group-hover:bg-foreground/30" />
    </div>
  );
}

// Per-chart zoom for interactive hosts (VS Code preview, Obsidian).
//
// Mounted on a .pfc-frame that wraps the scrolling .pfc-container: adds a −/%/+
// toolbar and Ctrl/Cmd + wheel (or trackpad pinch) zoom around the pointer.
// The default is "fit" (the stylesheet's shrink-to-fit with a floor); a zoom
// sets an explicit width relative to the chart's natural size instead.
//
// mountZoom is idempotent and keeps its state per frame element, so a host that
// rebuilds the frame's children (VS Code's preview diffs the DOM on every edit)
// can simply call it again to restore the toolbar and the zoom.

const LEVELS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const MIN = LEVELS[0];
const MAX = LEVELS[LEVELS.length - 1];
const EPS = 0.005;

interface ZoomState {
  scale: number | null; // null = fit
}

const states = new WeakMap<HTMLElement, ZoomState>();

/** Next preset zoom level from `current`, in direction `dir` (+1 in, -1 out). */
export function zoomStep(current: number, dir: 1 | -1): number {
  if (dir > 0) return LEVELS.find((l) => l > current + EPS) ?? MAX;
  for (let i = LEVELS.length - 1; i >= 0; i--) if (LEVELS[i] < current - EPS) return LEVELS[i];
  return MIN;
}

function parts(frame: HTMLElement) {
  const box = frame.querySelector<HTMLElement>(".pfc-container");
  const svg = box?.querySelector<SVGSVGElement>("svg.pfc-svg");
  return box && svg ? { box, svg } : null;
}

function naturalWidth(svg: SVGSVGElement): number {
  return svg.viewBox.baseVal.width || Number(svg.getAttribute("width")) || 1;
}

function button(action: string, text: string, title: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `pfc-zoom-${action}`;
  b.dataset.pfcZoom = action;
  b.textContent = text;
  b.title = title;
  b.setAttribute("aria-label", title);
  return b;
}

function toolbar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "pfc-zoom-bar";
  bar.append(
    button("out", "−", "Zoom out"),
    button("reset", "Fit", "Reset zoom to fit"),
    button("in", "+", "Zoom in")
  );
  // clicks still bubble to the frame's handler; only these are kept from the host
  bar.addEventListener("mousedown", stopPress);
  bar.addEventListener("dblclick", stopPress);
  return bar;
}

// class + custom property only; no layout reads, so re-applying right after a
// host's DOM update keeps the container's scroll position
function apply(frame: HTMLElement, svg: SVGSVGElement, state: ZoomState): void {
  if (state.scale === null) {
    frame.classList.remove("pfc-zoomed");
    frame.style.removeProperty("--pfc-zoom-width");
  } else {
    frame.classList.add("pfc-zoomed");
    frame.style.setProperty("--pfc-zoom-width", `${Math.round(naturalWidth(svg) * state.scale)}px`);
  }
  const bar = frame.querySelector(".pfc-zoom-bar");
  if (!bar) return;
  const s = state.scale;
  bar.querySelector(".pfc-zoom-reset")!.textContent =
    s === null ? "Fit" : `${Math.round(s * 100)}%`;
  (bar.querySelector(".pfc-zoom-out") as HTMLButtonElement).disabled = s !== null && s <= MIN + EPS;
  (bar.querySelector(".pfc-zoom-in") as HTMLButtonElement).disabled = s !== null && s >= MAX - EPS;
}

// change the zoom, keeping the chart point under (x, y) where it is on screen
function zoomTo(frame: HTMLElement, next: number | null, x: number, y: number): void {
  const p = parts(frame);
  const state = states.get(frame);
  if (!p || !state) return;
  const before = p.svg.getBoundingClientRect();
  if (!before.width || !before.height) return;
  const fx = (x - before.left) / before.width;
  const fy = (y - before.top) / before.height;
  state.scale = next === null ? null : Math.min(MAX, Math.max(MIN, next));
  apply(frame, p.svg, state);
  const after = p.svg.getBoundingClientRect();
  p.box.scrollLeft += after.left + fx * after.width - x;
  p.box.scrollTop += after.top + fy * after.height - y;
}

function currentScale(frame: HTMLElement): number {
  const state = states.get(frame);
  if (state && state.scale !== null) return state.scale;
  const p = parts(frame);
  if (!p) return 1;
  return p.svg.getBoundingClientRect().width / naturalWidth(p.svg) || 1;
}

function onClick(this: HTMLElement, e: MouseEvent): void {
  const btn = (e.target as Element).closest<HTMLElement>("[data-pfc-zoom]");
  const p = parts(this);
  if (!btn || !p) return;
  const r = p.box.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const action = btn.dataset.pfcZoom;
  if (action === "reset") zoomTo(this, null, x, y);
  else zoomTo(this, zoomStep(currentScale(this), action === "in" ? 1 : -1), x, y);
}

function onWheel(this: HTMLElement, e: WheelEvent): void {
  // plain wheel keeps scrolling; trackpad pinch arrives as a ctrl + wheel event
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  // mouse wheel notches are ~100px; clamp them so one notch is a ~20% step
  const dy = Math.max(-20, Math.min(20, e.deltaY));
  zoomTo(this, currentScale(this) * Math.exp(-dy / 100), e.clientX, e.clientY);
}

// Hosts act on presses inside a rendered chart: Obsidian's Live Preview opens the
// block's source on mousedown, VS Code's preview jumps to the editor on double-click.
// Presses on the toolbar, or on a scrollbar (whose target is the scroll box itself),
// are zoom and scroll gestures, so keep them from reaching the host. Stopped below
// the frame, since the frame may be the host's own element.
function stopPress(e: MouseEvent): void {
  e.stopPropagation();
}

function stopScrollbarPress(e: MouseEvent): void {
  if (e.target === e.currentTarget) e.stopPropagation();
}

/** Add zoom controls to a .pfc-frame (safe to call again after a re-render). */
export function mountZoom(frame: HTMLElement): void {
  const p = parts(frame);
  if (!p) return;
  let state = states.get(frame);
  if (!state) {
    state = { scale: null };
    states.set(frame, state);
    // listeners live on the frame, which survives hosts rebuilding its children
    frame.addEventListener("click", onClick);
    frame.addEventListener("wheel", onWheel, { passive: false });
  }
  // re-adding the same listener is a no-op, so this is safe on every mount
  for (const type of ["mousedown", "dblclick"] as const)
    p.box.addEventListener(type, stopScrollbarPress);
  if (!frame.querySelector(".pfc-zoom-bar")) frame.appendChild(toolbar());
  apply(frame, p.svg, state);
}

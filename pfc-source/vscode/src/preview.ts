// Markdown-preview script (runs inside the preview webview, not the extension
// host): adds zoom controls to every rendered chart.
//
// On each edit the preview diffs the new HTML into the page, which drops the
// toolbar and the zoom class but keeps the frame elements, so mountZoom just
// runs again after every update and restores each chart's zoom.

import { mountZoom } from "@pfc/core";

function mountAll(): void {
  document.querySelectorAll<HTMLElement>(".pfc-frame").forEach(mountZoom);
}

window.addEventListener("vscode.markdown.updateContent", mountAll);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
else mountAll();

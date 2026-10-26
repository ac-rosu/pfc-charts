import { HoverParent, Keymap, Plugin, TFile } from "obsidian";
import {
  parsePfc,
  ParseError,
  renderChart,
  headingSlug,
  isExternalLink,
  resolveRelativePath,
  safeDecode,
  splitLink,
  mountZoom,
} from "@pfc/core";

// Page-preview source id for linked steps (listed under Settings > Page preview).
const HOVER_SOURCE = "pfc-charts";

export default class PfcChartsPlugin extends Plugin {
  async onload() {
    // hovering a step shows its note only with Mod held by default, so moving the
    // mouse across a chart doesn't pop up previews
    this.registerHoverLinkSource(HOVER_SOURCE, { display: this.manifest.name, defaultMod: true });

    this.registerMarkdownCodeBlockProcessor("pfc", (source, el, ctx) => {
      el.empty();
      try {
        const svg = renderChart(parsePfc(source), { links: true });
        el.addClass("pfc-frame");
        el.createDiv({ cls: "pfc-container" }).appendChild(svg);
        this.wireLinks(el, ctx.sourcePath);
        mountZoom(el);
      } catch (e) {
        const pre = el.createEl("pre", { cls: "pfc-error" });
        if (e instanceof ParseError) {
          pre.setText(
            e.line > 0
              ? `PFC error (line ${e.line}): ${e.message}`
              : `PFC error: ${e.message}`
          );
        } else {
          pre.setText(`PFC error: ${(e as Error).message}`);
        }
      }
    });
  }

  // Linked steps open their note the Obsidian way: Mod-click for a new tab, page
  // preview on hover, and a missing note is created on click (like an unresolved link).
  private wireLinks(el: HTMLElement, sourcePath: string): void {
    const hoverParent: HoverParent = { hoverPopover: null };
    el.querySelectorAll<HTMLAnchorElement>("a.pfc-link").forEach((a) => {
      const target = a.getAttribute("href") ?? "";
      const external = isExternalLink(target);
      if (!external && !this.resolveLink(target, sourcePath).file) {
        a.addClass("is-unresolved");
        a.setAttr("title", `${a.getAttribute("title") ?? target} (note doesn't exist yet; click to create it)`);
      }
      // Live Preview turns a mousedown on a rendered block into "edit its source"
      a.addEventListener("mousedown", (evt) => evt.stopPropagation());
      a.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (external) {
          window.open(target);
          return;
        }
        const { linktext } = this.resolveLink(target, sourcePath);
        void this.app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(evt));
      });
      if (!external)
        a.addEventListener("mouseover", (event) => {
          this.app.workspace.trigger("hover-link", {
            event,
            source: HOVER_SOURCE,
            hoverParent,
            targetEl: a,
            linktext: this.resolveLink(target, sourcePath).linktext,
            sourcePath,
          });
        });
    });
  }

  // Accept the same targets as VS Code (relative paths, URL-encoded names, ".md" or
  // not, heading slugs) as well as Obsidian's own note names and heading text.
  private resolveLink(target: string, sourcePath: string): { linktext: string; file: TFile | null } {
    const split = splitLink(target);
    const path = resolveRelativePath(sourcePath, safeDecode(split.path));
    const heading = safeDecode(split.heading);
    const self = this.app.vault.getAbstractFileByPath(sourcePath);
    const file = path
      ? this.app.metadataCache.getFirstLinkpathDest(path, sourcePath)
      : self instanceof TFile
        ? self
        : null;
    if (!file) return { linktext: path + (heading ? `#${heading}` : ""), file: null };
    let sub = "";
    if (heading) {
      const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
      const match =
        headings.find((h) => h.heading === heading) ??
        headings.find((h) => headingSlug(h.heading) === headingSlug(heading));
      sub = `#${match ? match.heading : heading}`;
    }
    return { linktext: file.path + sub, file };
  }
}

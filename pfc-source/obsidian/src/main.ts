import { Plugin } from "obsidian";
import { parsePfc, ParseError, renderChart } from "@pfc/core";

export default class PfcChartsPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor("pfc", (source, el) => {
      el.empty();
      el.addClass("pfc-container");
      try {
        const chart = parsePfc(source);
        el.appendChild(renderChart(chart));
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
}

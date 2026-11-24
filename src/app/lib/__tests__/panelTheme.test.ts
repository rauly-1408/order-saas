import { describe, expect, it } from "vitest";
import { panelBrand, panelCssVars } from "../panelTheme";

describe("tema del panel", () => {
  it("texto legible sobre la marca: blanco en verde oscuro, oscuro en amarillo", () => {
    expect((panelCssVars(panelBrand({ primaryColor: "#0d3328" })) as Record<string, string>)["--p-on-brand"]).toBe("#ffffff");
    expect((panelCssVars(panelBrand({ primaryColor: "#ffd60a" })) as Record<string, string>)["--p-on-brand"]).toBe("#1d1d1f");
  });
});

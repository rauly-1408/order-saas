import { describe, expect, it } from "vitest";
import { accessOf, defaultStationCategories, puestoOf } from "../roles";

const emp = (position: string | null, canCharge = true) => ({ role: "STORE_MANAGER", position, canCharge });

describe("accessOf", () => {
  it("el gerente lo ve todo", () => {
    const a = accessOf({ role: "TENANT_ADMIN" });
    expect(a.manager && a.caja && a.mesas && a.facturas && a.cobrar && a.anular).toBe(true);
    expect(a.home).toBe("home");
  });

  it("un empleado antiguo sin puesto cuenta como caja", () => {
    expect(puestoOf(emp(null))).toBe("CAJA");
    expect(accessOf(emp(null))).toMatchObject({ caja: true, cobrar: true, anular: false, manager: false });
  });

  it("el encargado anula; la caja no", () => {
    expect(accessOf(emp("ENCARGADO")).anular).toBe(true);
    expect(accessOf(emp("CAJA")).anular).toBe(false);
  });

  it("el camarero lleva mesas y cobra solo si se le permite", () => {
    expect(accessOf(emp("CAMARERO"))).toMatchObject({ mesas: true, caja: false, facturas: false, cobrar: true, home: "mesas" });
    expect(accessOf(emp("CAMARERO", false)).cobrar).toBe(false);
  });

  it("cocina y barra solo ven pedidos como estación", () => {
    for (const p of ["COCINA", "BARRA"] as const) {
      expect(accessOf(emp(p))).toMatchObject({ station: p, pedidos: true, caja: false, mesas: false, cobrar: false, anular: false, home: "cocina" });
    }
  });
});

describe("defaultStationCategories", () => {
  const cats = [
    { id: "a", name: "Bocadillos" },
    { id: "b", name: "Bebidas" },
    { id: "c", name: "Cervezas y vinos" },
    { id: "d", name: "Postres" },
  ];
  it("barra recibe las bebidas y cocina el resto", () => {
    expect(defaultStationCategories("BARRA", cats)).toEqual(["b", "c"]);
    expect(defaultStationCategories("COCINA", cats)).toEqual(["a", "d"]);
  });
});

describe("caja prestada", () => {
  const later = new Date(Date.now() + 3600_000);
  const before = new Date(Date.now() - 1000);
  it("el camarero no tiene caja hasta que se la dejan", () => {
    expect(accessOf(emp("CAMARERO")).caja).toBe(false);
    const a = accessOf({ ...emp("CAMARERO"), cajaUntil: later });
    expect(a).toMatchObject({ caja: true, prestada: true, cierreDia: false, anular: false });
    expect(accessOf({ ...emp("CAMARERO"), cajaUntil: later, cajaCloseDay: true }).cierreDia).toBe(true);
  });
  it("caduca sola", () => {
    expect(accessOf({ ...emp("CAMARERO"), cajaUntil: before, cajaCloseDay: true })).toMatchObject({ caja: false, cierreDia: false });
  });
  it("el cierre del día: encargado y gerente; Caja solo si se lo dejan", () => {
    expect(accessOf({ role: "TENANT_ADMIN" }).cierreDia).toBe(true);
    expect(accessOf(emp("ENCARGADO")).cierreDia).toBe(true);
    expect(accessOf(emp("CAJA")).cierreDia).toBe(false);
    expect(accessOf({ ...emp("CAJA"), cajaUntil: later, cajaCloseDay: true })).toMatchObject({ cierreDia: true, prestada: false });
  });
  it("cocina no recibe caja aunque se la dejen", () => {
    expect(accessOf({ ...emp("COCINA"), cajaUntil: later }).caja).toBe(false);
  });
});

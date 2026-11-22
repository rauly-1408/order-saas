import { describe, expect, it } from "vitest";
import { sanitizeVoice, type VoiceIngredient } from "@/app/lib/voiceStock";

const ING: VoiceIngredient[] = [
  { id: "tom", name: "Tomate", baseUnit: "G", packSize: 5000 },
  { id: "pan", name: "Pan", baseUnit: "UNIT", packSize: 12 },
];

describe("sanitizeVoice", () => {
  it("se queda con las líneas válidas", () => {
    const out = sanitizeVoice({ lines: [{ heard: "3 kilos de tomate", ingredientId: "tom", type: "COUNT", quantity: 3000, note: null }] }, ING);
    expect(out).toEqual([{ heard: "3 kilos de tomate", ingredientId: "tom", type: "COUNT", quantity: 3000, note: null }]);
  });
  it("quita ids que no son del restaurante pero deja la línea para elegir", () => {
    const out = sanitizeVoice({ lines: [{ heard: "x", ingredientId: "otro-tenant", type: "RECEIPT", quantity: 2, note: "" }] }, ING);
    expect(out[0].ingredientId).toBeNull();
    expect(out[0].note).toBeNull();
  });
  it("descarta tipos y cantidades imposibles", () => {
    const out = sanitizeVoice(
      { lines: [
        { heard: "a", ingredientId: "tom", type: "ORDER", quantity: 1, note: null },
        { heard: "b", ingredientId: "tom", type: "WASTE", quantity: -5, note: null },
        { heard: "c", ingredientId: "tom", type: "RECEIPT", quantity: 0, note: null },
        { heard: "d", ingredientId: "pan", type: "COUNT", quantity: 0, note: null },
        { heard: "e", ingredientId: "pan", type: "COUNT", quantity: "abc", note: null },
      ] },
      ING
    );
    expect(out.map((l) => l.heard)).toEqual(["d"]);
  });
  it("aguanta respuestas sin forma", () => {
    expect(sanitizeVoice(null, ING)).toEqual([]);
    expect(sanitizeVoice({ lines: "no" }, ING)).toEqual([]);
  });
});

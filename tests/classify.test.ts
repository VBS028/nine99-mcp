import { describe, it, expect } from "vitest";
import { classifyIntent } from "../src/classify.js";

describe("classifyIntent", () => {
  it("detects wanted-ads in both languages", () => {
    expect(classifyIntent("Куплю телевизор нерабочий")).toBe("wanted");
    expect(classifyIntent("Cumpăr televizor stricat")).toBe("wanted");
  });

  it("detects services in both languages", () => {
    expect(classifyIntent("Reparația televizoarelor la domiciliu")).toBe("service");
    expect(classifyIntent("Ремонт телевизоров на дому")).toBe("service");
    expect(classifyIntent("Instalare IPTV pentru smart tv")).toBe("service");
  });

  it("detects parts listings in both languages", () => {
    expect(classifyIntent("Piese TV LG")).toBe("parts");
    expect(classifyIntent("Продаю платы и матрицы для телевизоров")).toBe("parts");
    expect(classifyIntent("SmartTech LE-32D7 pentru piese (ecran spart)")).toBe("parts");
  });

  it("treats an ordinary sale as unknown, not a drop", () => {
    expect(classifyIntent("Televizor LG 32 inch, stare bună")).toBe("unknown");
    expect(classifyIntent("Телевизор Samsung 32")).toBe("unknown");
  });

  it("marks an explicit sale as sale", () => {
    expect(classifyIntent("Vând televizor Panasonic 32")).toBe("sale");
    expect(classifyIntent("Продам телевизор Sony")).toBe("sale");
  });

  it("errs toward inclusion when signals are weak", () => {
    // "cablu" is not a parts signal on its own.
    expect(classifyIntent("Televizor cu cablu inclus")).toBe("unknown");
  });

  it("reads the description as well as the title", () => {
    expect(classifyIntent("Televizor", "Vând pe piese, ecranul este spart")).toBe("parts");
  });

  it("anchors Romanian cumpăr to avoid matching cumpărare (noun form)", () => {
    // "Se poate testa înainte de cumpărare" is sale-ad boilerplate, not a wanted signal.
    // The verb "vând" is required to classify as sale.
    expect(classifyIntent("Televizor LG OLED", "Vând în stare bună. Se poate testa înainte de cumpărare")).toBe("sale");
  });

  it("detects Russian parts without overly broad stems", () => {
    // Verify that "запчасти" patterns still work for parts
    expect(classifyIntent("Телевизор на запчасти")).toBe("parts");
    expect(classifyIntent("Продаю на запчасти телевизора")).toBe("parts");
  });
});

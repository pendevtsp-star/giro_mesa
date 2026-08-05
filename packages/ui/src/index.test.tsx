// @vitest-environment jsdom

import { act, createElement, isValidElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Alert,
  Button,
  ConfirmationDialog,
  Dialog,
  Drawer,
  EmptyState,
  MetricCard,
  MoneyInput,
  PageHeader,
  PinInput,
  SimpleTable,
} from "./index";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("@giromesa/ui", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      configurable: true,
      get() {
        return this.parentElement;
      },
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = "";
    vi.restoreAllMocks();
  });

  it("creates shared product UI elements with stable public classes", () => {
    const components = [
      PageHeader({ kicker: "Operação", title: "Visão do turno", description: "Resumo executivo" }),
      MetricCard({ label: "Vendas", value: "R$ 8.420", hint: "+12%" }),
      Button({ variant: "secondary", children: "Abrir PDV" }),
      Alert({ title: "Atenção", tone: "warning", children: "Revise o caixa antes de fechar." }),
      EmptyState({ title: "Sem pedidos", description: "A fila está livre agora." }),
      SimpleTable({
        columns: ["Produto", "Status"],
        rows: [
          {
            id: "1",
            cells: [
              { key: "product", content: "Burger" },
              { key: "status", content: "Ativo" },
            ],
          },
        ],
      }),
      MoneyInput({ label: "Valor", value: "10,00", readOnly: true }),
      PinInput({ value: "1234", readOnly: true }),
      ConfirmationDialog({
        open: true,
        title: "Cancelar item",
        description: "Esta ação exige confirmação.",
        onCancel: () => {},
        onConfirm: () => {},
      }),
    ];

    const hookedComponents = [
      createElement(
        Dialog,
        {
          open: true,
          title: "Receber",
          onClose: () => {},
        },
        "Pagamento",
      ),
      createElement(
        Drawer,
        {
          open: true,
          title: "Comanda",
          onClose: () => {},
        },
        "Itens",
      ),
    ];

    expect(components.every(isValidElement)).toBe(true);
    expect(hookedComponents.every(isValidElement)).toBe(true);
    expect(
      components.map((component) =>
        isValidElement<{ className?: string }>(component) ? component.props.className : null,
      ),
    ).toEqual([
      "gm-page-header",
      "gm-metric-card",
      "gm-button gm-button-secondary",
      "gm-alert gm-alert-warning",
      "gm-empty-state",
      "gm-table-wrap",
      "gm-field",
      "gm-field",
      undefined,
    ]);
  });

  for (const kind of ["dialog", "drawer"] as const) {
    it(`${kind} contains focus, closes with Escape, restores focus and unlocks the body`, () => {
      act(() => root.render(<OverlayHarness kind={kind} />));
      const trigger = container.querySelector<HTMLButtonElement>("[data-trigger]");
      expect(trigger).not.toBeNull();

      act(() => {
        trigger?.focus();
        trigger?.click();
      });
      const overlay = container.querySelector<HTMLElement>('[role="dialog"]');
      const first = container.querySelector<HTMLButtonElement>("[data-first]");
      const boundaryFirst = overlay?.querySelector<HTMLButtonElement>('[aria-label="Fechar"]');
      const boundaryLast = container.querySelector<HTMLButtonElement>("[data-last]");
      expect(overlay).not.toBeNull();
      expect(document.body.style.overflow).toBe("hidden");
      expect(document.activeElement).toBe(first);

      act(() => {
        boundaryFirst?.focus();
        boundaryFirst?.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }),
        );
      });
      expect(document.activeElement).toBe(boundaryLast);

      act(() =>
        boundaryLast?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" })),
      );
      expect(document.activeElement).toBe(boundaryFirst);

      act(() =>
        overlay?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })),
      );
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.body.style.overflow).toBe("");
      expect(document.activeElement).toBe(trigger);
    });
  }

  it("dialog respects dismissible=false and closes from its backdrop when allowed", () => {
    act(() => root.render(<OverlayHarness dismissible={false} kind="dialog" />));
    const trigger = container.querySelector<HTMLButtonElement>("[data-trigger]");
    act(() => {
      trigger?.focus();
      trigger?.click();
    });
    const overlay = container.querySelector<HTMLElement>('[role="dialog"]');
    act(() =>
      overlay?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })),
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => root.render(<OverlayHarness kind="dialog" startOpen />));
    const backdrop = container.querySelector<HTMLElement>(".gm-dialog-backdrop");
    act(() =>
      backdrop?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

function OverlayHarness({
  dismissible = true,
  kind,
  startOpen = false,
}: {
  dismissible?: boolean;
  kind: "dialog" | "drawer";
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const Overlay = kind === "dialog" ? Dialog : Drawer;

  return (
    <>
      <button data-trigger onClick={() => setOpen(true)} type="button">
        Abrir
      </button>
      <Overlay
        dismissible={dismissible}
        onClose={() => setOpen(false)}
        open={open}
        title="Preferências"
      >
        <button data-dialog-initial-focus data-first type="button">
          Primeiro
        </button>
        <button data-last type="button">
          Último
        </button>
      </Overlay>
    </>
  );
}

import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { Alert, Button, EmptyState, MetricCard, PageHeader, SimpleTable } from "./index";

describe("@giromesa/ui", () => {
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
    ];

    expect(components.every(isValidElement)).toBe(true);
    expect(components.map((component) => component.props.className)).toEqual([
      "gm-page-header",
      "gm-metric-card",
      "gm-button gm-button-secondary",
      "gm-alert gm-alert-warning",
      "gm-empty-state",
      "gm-table-wrap",
    ]);
  });
});

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const masterPath = resolve(root, "docs/superpowers/plans/2026-08-01-plano-unificado-giro-mesa.md");
const todoPath = resolve(root, "docs/superpowers/plans/plano-a-fazer-giro-mesa.md");
const donePath = resolve(root, "docs/superpowers/plans/plano-executado-giro-mesa.md");

function taskId(path, body) {
  const normalized = body
    .join(" ")
    .replace(/^- \[[ xX]\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256")
    .update(`${path.join(" > ")}\n${normalized}`)
    .digest("hex")
    .slice(0, 16);
}

function parseMaster(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headings = new Map();
  const tasks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^(#{2,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      headings.set(level, heading[2].trim());
      for (const key of [...headings.keys()]) if (key > level) headings.delete(key);
      continue;
    }

    const checkbox = /^- \[([ xX])\]\s+/.exec(line);
    if (!checkbox) continue;

    const body = [line];
    while (index + 1 < lines.length && /^\s{2,}\S/.test(lines[index + 1])) {
      body.push(lines[index + 1]);
      index += 1;
    }
    const path = [...headings.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, value]) => value);
    tasks.push({
      id: taskId(path, body),
      path,
      body,
      done: checkbox[1].toLowerCase() === "x",
    });
  }
  return tasks;
}

function previousTodoIds() {
  if (!existsSync(todoPath)) return new Set();
  return new Set(
    [...readFileSync(todoPath, "utf8").matchAll(/<!-- task-id:([a-f0-9]{16}) -->/g)].map(
      (match) => match[1],
    ),
  );
}

function renderTodo(tasks) {
  const pending = tasks.filter((task) => !task.done);
  const groups = new Map();
  for (const task of pending) {
    const label = task.path.join(" › ") || "Sem seção";
    const group = groups.get(label) ?? [];
    group.push(task);
    groups.set(label, group);
  }

  const output = [
    "# GiroMesa — plano a fazer",
    "",
    `> Visão operacional gerada do plano mestre. Pendências atuais: **${pending.length}**.`,
    "> O plano mestre continua sendo a autoridade; não edite checkboxes somente aqui.",
    "",
    "## Fluxo de sincronização",
    "",
    "1. Nova feature ou correção entra primeiro no plano mestre como `[ ]`.",
    "2. Execute `pnpm plan:sync` para atualizar esta visão.",
    "3. Depois da validação, marque `[x]` no plano mestre e execute novamente.",
    "4. A tarefa sai daqui e entra no plano executado com a data da sincronização.",
    "",
  ];

  for (const [label, group] of groups) {
    output.push(`## ${label}`, "");
    for (const task of group) {
      output.push(`<!-- task-id:${task.id} -->`, ...task.body, "");
    }
  }
  return `${output.join("\n").trim()}\n`;
}

function appendCompleted(existing, completed) {
  if (completed.length === 0) return existing;
  const date = new Date().toISOString().slice(0, 10);
  const hasCurrentDate = new RegExp(`^## ${date}$`, "m").test(existing);
  const lines = [existing.trimEnd(), "", ...(hasCurrentDate ? [] : [`## ${date}`, ""])];
  for (const task of completed) {
    lines.push(
      `<!-- completed-task-id:${task.id} -->`,
      `- [x] **${task.path.join(" › ") || "Sem seção"}** — ${task.body
        .join(" ")
        .replace(/^- \[[ xX]\]\s*/, "")
        .replace(/\s+/g, " ")
        .trim()}`,
      "",
    );
  }
  return `${lines.join("\n").trim()}\n`;
}

const master = readFileSync(masterPath, "utf8");
const tasks = parseMaster(master);
const priorIds = previousTodoIds();
const existingDone = existsSync(donePath)
  ? readFileSync(donePath, "utf8")
  : [
      "# GiroMesa — plano executado",
      "",
      "> Histórico incremental iniciado em 2026-08-04.",
      "> Registra somente tarefas que passaram pelo plano a fazer após este corte.",
      "",
    ].join("\n");
const completedIds = new Set(
  [...existingDone.matchAll(/<!-- completed-task-id:([a-f0-9]{16}) -->/g)].map((match) => match[1]),
);
const newlyCompleted = tasks.filter(
  (task) => task.done && priorIds.has(task.id) && !completedIds.has(task.id),
);

writeFileSync(todoPath, renderTodo(tasks), "utf8");
writeFileSync(donePath, appendCompleted(existingDone, newlyCompleted), "utf8");

console.log(
  JSON.stringify({
    pending: tasks.filter((task) => !task.done).length,
    newlyCompleted: newlyCompleted.length,
    todoPath,
    donePath,
  }),
);

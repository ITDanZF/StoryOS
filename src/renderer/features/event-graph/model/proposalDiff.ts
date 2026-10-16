import type {
  OutlineNode,
  OutlinePatch,
  OutlinePatchOperation,
  OutlineSnapshot,
  UpdateNodeInput,
} from "../../../../shared/contracts/outline/outlineContracts.ts";

export type ProposalEntry = {
  readonly index: number;
  readonly kind: "create" | "update" | "relation" | "promise" | "delete" | "other";
  readonly title: string;
  readonly lines: readonly string[];
  readonly unnamed: boolean;
  readonly editable: boolean;
  readonly values: {
    readonly title: string;
    readonly goal: string;
    readonly conflict: string;
    readonly outcome: string;
  } | null;
};

export type ProposalReading = {
  readonly entries: readonly ProposalEntry[];
  readonly unnamedCount: number;
  readonly affectedChapters: readonly { readonly chapterId: string; readonly nodeTitle: string }[];
};

const TEXT_FIELDS = ["title", "goal", "conflict", "outcome", "summary"] as const;

export function readProposal(
  snapshot: OutlineSnapshot | null,
  patch: OutlinePatch,
  focusNodeIds: readonly string[],
): ProposalReading {
  const focus = new Set(focusNodeIds);
  const entries = patch.operations.map((operation, index) => readOperation(snapshot, operation, index, focus));
  const affected = new Map<string, string>();
  for (const operation of patch.operations) {
    const nodeId = existingNodeId(operation);
    if (!nodeId || !snapshot) continue;
    const node = snapshot.nodes.find((item) => item.id === nodeId);
    for (const mapping of snapshot.mappings) {
      if (mapping.nodeId !== nodeId) continue;
      affected.set(`${mapping.chapterId}:${nodeId}`, `${node?.title ?? nodeId}`);
      affected.set(mapping.chapterId, node?.title ?? nodeId);
    }
  }
  const affectedChapters = [...affected.entries()]
    .filter(([key]) => !key.includes(":"))
    .map(([chapterId, nodeTitle]) => ({ chapterId, nodeTitle }));
  return {
    entries,
    unnamedCount: entries.filter((entry) => entry.unnamed).length,
    affectedChapters,
  };
}

export function editProposalText(
  patch: OutlinePatch,
  index: number,
  field: "title" | "goal" | "conflict" | "outcome",
  value: string,
): OutlinePatch | null {
  const operation = patch.operations[index];
  if (!operation) return null;
  if (operation.type === "create_node") {
    return replaceOperation(patch, index, { ...operation, value: { ...operation.value, [field]: value } });
  }
  if (operation.type === "update_node") {
    return replaceOperation(patch, index, { ...operation, changes: { ...operation.changes, [field]: value } });
  }
  return null;
}

function readOperation(
  snapshot: OutlineSnapshot | null,
  operation: OutlinePatchOperation,
  index: number,
  focus: ReadonlySet<string>,
): ProposalEntry {
  if (operation.type === "create_node") {
    return {
      index,
      kind: "create",
      title: operation.value.title || "未命名事件",
      lines: [
        `目标：${show(operation.value.goal)}`,
        `冲突：${show(operation.value.conflict)}`,
        `结果：${show(operation.value.outcome)}`,
      ],
      unnamed: false,
      editable: true,
      values: {
        title: operation.value.title,
        goal: operation.value.goal,
        conflict: operation.value.conflict,
        outcome: operation.value.outcome,
      },
    };
  }
  if (operation.type === "update_node") {
    const current = snapshot?.nodes.find((node) => node.id === operation.nodeId);
    return {
      index,
      kind: "update",
      title: current?.title ?? operation.nodeId,
      lines: changedLines(current, operation.changes),
      unnamed: !focus.has(operation.nodeId),
      editable: true,
      values: {
        title: operation.changes.title ?? current?.title ?? "",
        goal: operation.changes.goal ?? current?.goal ?? "",
        conflict: operation.changes.conflict ?? current?.conflict ?? "",
        outcome: operation.changes.outcome ?? current?.outcome ?? "",
      },
    };
  }
  if (operation.type === "delete_node" || operation.type === "move_node") {
    const nodeId = operation.nodeId;
    const current = snapshot?.nodes.find((node) => node.id === nodeId);
    return {
      index,
      kind: operation.type === "delete_node" ? "delete" : "other",
      title: current?.title ?? nodeId,
      lines: [operation.type === "delete_node" ? "删除这个节点" : "移动这个节点"],
      unnamed: !focus.has(nodeId),
      editable: false,
      values: null,
    };
  }
  if (operation.type === "upsert_relation") {
    return {
      index,
      kind: "relation",
      title: "关系",
      lines: [`${operation.value.type}：${operation.value.description || "未写说明"}`],
      unnamed: false,
      editable: false,
      values: null,
    };
  }
  if (operation.type === "delete_relation") {
    return {
      index,
      kind: "relation",
      title: "关系",
      lines: ["删除一条关系"],
      unnamed: false,
      editable: false,
      values: null,
    };
  }
  return {
    index,
    kind: "promise",
    title: operation.value.title || "承诺",
    lines: [`${operation.value.status}：${operation.value.payoffRequirement || "未写兑现"}`],
    unnamed: false,
    editable: false,
    values: null,
  };
}

function changedLines(node: OutlineNode | undefined, changes: UpdateNodeInput): string[] {
  const lines: string[] = [];
  for (const field of TEXT_FIELDS) {
    const next = changes[field];
    if (typeof next !== "string") continue;
    const previous = node?.[field] ?? "";
    if (previous === next) continue;
    lines.push(`${fieldLabel(field)}：${show(previous)} → ${show(next)}`);
  }
  return lines.length > 0 ? lines : ["没有文字变化"];
}

function fieldLabel(field: (typeof TEXT_FIELDS)[number]): string {
  if (field === "title") return "标题";
  if (field === "goal") return "目标";
  if (field === "conflict") return "冲突";
  if (field === "outcome") return "结果";
  return "摘要";
}

function existingNodeId(operation: OutlinePatchOperation): string | null {
  if (operation.type === "update_node" || operation.type === "delete_node" || operation.type === "move_node") {
    return operation.nodeId;
  }
  return null;
}

function replaceOperation(patch: OutlinePatch, index: number, operation: OutlinePatchOperation): OutlinePatch {
  return {
    ...patch,
    operations: patch.operations.map((item, itemIndex) => (itemIndex === index ? operation : item)),
  };
}

function show(value: string): string {
  const text = value.trim();
  return text === "" ? "待定" : text;
}

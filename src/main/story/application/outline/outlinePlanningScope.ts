import type { OutlinePatchOperation, OutlinePlanningScope, OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import { OutlineValidationError } from "./outlineErrors.ts";

export function assertPlanningScope(snapshot: OutlineSnapshot, scope: OutlinePlanningScope, operations: readonly OutlinePatchOperation[]): void {
  const exists = (id: string) => snapshot.nodes.some((node) => node.id === id);
  const created = new Set(operations.filter((operation) => operation.type === "create_node").map((operation) => operation.tempId));
  if (scope.kind === "field") {
    if (!exists(scope.nodeId)) throw new OutlineValidationError("规划节点不存在");
    if (operations.length !== 1 || operations[0]?.type !== "update_node" ||
      operations[0].nodeId !== scope.nodeId || Object.keys(operations[0].changes).length !== 1 ||
      !(scope.field in operations[0].changes)) throw new OutlineValidationError("字段规划超出指定范围");
    return;
  }
  if (scope.kind === "relation") {
    if (!exists(scope.sourceNodeId) || !exists(scope.targetNodeId) || scope.sourceNodeId === scope.targetNodeId) {
      throw new OutlineValidationError("规划关系节点不存在");
    }
    if (operations.length !== 1 || !operations.every((operation) => {
      if (operation.type === "upsert_relation") return operation.value.sourceNodeId === scope.sourceNodeId && operation.value.targetNodeId === scope.targetNodeId;
      if (operation.type === "delete_relation") {
        const relation = snapshot.relations.find((item) => item.id === operation.relationId);
        return relation?.sourceNodeId === scope.sourceNodeId && relation.targetNodeId === scope.targetNodeId;
      }
      return false;
    })) throw new OutlineValidationError("关系规划超出指定范围");
    return;
  }
  if (scope.kind === "book") {
    if (operations.some((operation) => operation.type === "update_node" || operation.type === "move_node" || operation.type === "delete_node" || operation.type === "delete_relation" ||
      (operation.type === "upsert_relation" && operation.value.id !== undefined))) {
      throw new OutlineValidationError("全书规划不能隐式修改已有节点");
    }
    return;
  }
  const rootId = scope.kind === "stage" ? scope.stageId : scope.nodeId;
  if (!exists(rootId)) throw new OutlineValidationError("规划节点不存在");
  if (scope.kind === "stage" && snapshot.nodes.find((node) => node.id === rootId)?.kind !== "arc") {
    throw new OutlineValidationError("所选节点不是阶段");
  }
  const allowed = new Set([rootId]);
  if (scope.kind === "stage") {
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of snapshot.nodes) {
        if (node.parentId && allowed.has(node.parentId) && !allowed.has(node.id)) {
          allowed.add(node.id);
          changed = true;
        }
      }
    }
  }
  const within = (id: string) => allowed.has(id) || created.has(id);
  for (const operation of operations) {
    const valid = (() => {
      switch (operation.type) {
        case "create_node": return operation.value.parentId !== null &&
          (scope.kind === "node" ? operation.value.parentId === rootId : within(operation.value.parentId));
        case "update_node": return allowed.has(operation.nodeId);
        case "move_node": return scope.kind === "stage" && allowed.has(operation.nodeId) && operation.parentId !== null && allowed.has(operation.parentId);
        case "delete_node": return allowed.has(operation.nodeId) && operation.nodeId !== rootId;
        case "upsert_relation": return scope.kind === "stage"
          ? within(operation.value.sourceNodeId) && within(operation.value.targetNodeId)
          : within(operation.value.sourceNodeId) || within(operation.value.targetNodeId);
        case "delete_relation": {
          const relation = snapshot.relations.find((item) => item.id === operation.relationId);
          return relation !== undefined && (scope.kind === "stage"
            ? allowed.has(relation.sourceNodeId) && allowed.has(relation.targetNodeId)
            : relation.sourceNodeId === rootId || relation.targetNodeId === rootId);
        }
        case "upsert_promise": return false;
      }
    })();
    if (!valid) throw new OutlineValidationError("规划候选超出指定范围");
  }
}

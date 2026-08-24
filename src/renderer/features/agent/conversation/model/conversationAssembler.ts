import type { ConversationEvent } from "./conversationEvent.ts";
import {
  createEmptyConversationProjection,
  type AssistantTextNode,
  type ConversationNode,
  type ConversationProjection,
  type ReasoningNode,
} from "./conversationNode.ts";

function assistantNodeKey(runId: string, blockId: string): string {
  return `assistant:${runId}:${blockId}`;
}

function toolNodeKey(runId: string, toolCallId: string): string {
  return `tool:${runId}:${toolCallId}`;
}

function taskNodeKey(runId: string, taskId: string): string {
  return `task:${runId}:${taskId}`;
}

function mergeOrder(
  order: readonly string[],
  nodes: Readonly<Record<string, ConversationNode>>,
): readonly string[] {
  const existing = new Set(order);
  return [
    ...order.filter((key) => Boolean(nodes[key])),
    ...Object.keys(nodes).filter((key) => !existing.has(key)),
  ];
}

function createAssistantNode(
  event: Extract<ConversationEvent, {
    readonly type:
      | "assistant.block.started"
      | "assistant.block.delta"
      | "assistant.block.completed";
  }>,
): ReasoningNode | AssistantTextNode {
  const state = event.type === "assistant.block.completed" ? "settled" : "running";
  if (event.payload.channel === "reasoning") {
    return {
      key: assistantNodeKey(event.runId, event.blockId),
      kind: "reasoning",
      runId: event.runId,
      stepId: event.stepId,
      blockId: event.blockId,
      anchorSequence: event.sequence,
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      state,
      text: event.type === "assistant.block.delta"
        ? event.payload.delta
        : event.type === "assistant.block.completed"
          ? event.payload.content ?? ""
          : "",
    };
  }

  return {
    key: assistantNodeKey(event.runId, event.blockId),
    kind: "assistant-text",
    runId: event.runId,
    stepId: event.stepId,
    blockId: event.blockId,
    channel: event.payload.channel,
    anchorSequence: event.sequence,
    createdAt: event.timestamp,
    updatedAt: event.timestamp,
    state,
    content: event.type === "assistant.block.delta"
      ? event.payload.delta
      : event.type === "assistant.block.completed"
        ? event.payload.content ?? ""
        : "",
  };
}

function updateAssistantNode(
  node: ReasoningNode | AssistantTextNode,
  event: Extract<ConversationEvent, {
    readonly type:
      | "assistant.block.started"
      | "assistant.block.delta"
      | "assistant.block.completed";
  }>,
): ReasoningNode | AssistantTextNode {
  const anchorSequence = Math.min(node.anchorSequence, event.sequence);
  const state = event.type === "assistant.block.completed" ? "settled" : node.state;
  if (node.kind === "reasoning") {
    return {
      ...node,
      anchorSequence,
      updatedAt: event.timestamp,
      state,
      text: event.type === "assistant.block.delta"
        ? `${node.text}${event.payload.delta}`
        : node.text,
    };
  }
  return {
    ...node,
    anchorSequence,
    updatedAt: event.timestamp,
    state,
    content: event.type === "assistant.block.delta"
      ? `${node.content}${event.payload.delta}`
      : node.content,
  };
}

function settleRunningAssistantNodes(
  nodes: Record<string, ConversationNode>,
  runId: string,
  timestamp: string,
): void {
  for (const [key, node] of Object.entries(nodes)) {
    if (
      node.runId === runId &&
      node.state === "running" &&
      (node.kind === "reasoning" || node.kind === "assistant-text")
    ) {
      nodes[key] = { ...node, state: "settled", updatedAt: timestamp };
    }
  }
}

export function applyConversationEvent(
  projection: ConversationProjection,
  event: ConversationEvent,
): ConversationProjection {
  if (projection.processedEventIds[event.eventId]) return projection;

  const nodes: Record<string, ConversationNode> = { ...projection.nodes };
  const turns = { ...projection.turns };
  let applied = true;

  switch (event.type) {
    case "user.message.created": {
      const key = `user:${event.payload.messageId}`;
      nodes[key] = {
        key,
        kind: "user-message",
        runId: event.runId,
        messageId: event.payload.messageId,
        content: event.payload.content,
        anchorSequence: event.sequence,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        state: "settled",
      };
      break;
    }
    case "turn.started":
      turns[event.runId] = {
        runId: event.runId,
        status: "running",
        startedAt: event.timestamp,
      };
      break;
    case "turn.completed":
      settleRunningAssistantNodes(nodes, event.runId, event.timestamp);
      turns[event.runId] = {
        runId: event.runId,
        status: "completed",
        startedAt: turns[event.runId]?.startedAt ?? event.timestamp,
        completedAt: event.timestamp,
        durationMs: event.payload.durationMs,
        content: event.payload.content,
      };
      break;
    case "turn.failed": {
      settleRunningAssistantNodes(nodes, event.runId, event.timestamp);
      turns[event.runId] = {
        runId: event.runId,
        status: "failed",
        startedAt: turns[event.runId]?.startedAt ?? event.timestamp,
        completedAt: event.timestamp,
        durationMs: event.payload.durationMs,
        error: event.payload.error,
      };
      const key = `turn-error:${event.runId}`;
      nodes[key] = {
        key,
        kind: "turn-error",
        runId: event.runId,
        anchorSequence: event.sequence,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        state: "failed",
        error: event.payload.error,
      };
      break;
    }
    case "assistant.block.started":
    case "assistant.block.delta":
    case "assistant.block.completed": {
      const key = assistantNodeKey(event.runId, event.blockId);
      const existing = nodes[key];
      if (existing?.kind === "reasoning" || existing?.kind === "assistant-text") {
        nodes[key] = updateAssistantNode(existing, event);
      } else {
        nodes[key] = createAssistantNode(event);
      }
      break;
    }
    case "tool.call.started": {
      const key = toolNodeKey(event.runId, event.payload.toolCallId);
      const existing = nodes[key];
      const previous = existing?.kind === "tool-call" ? existing : null;
      nodes[key] = {
        key,
        kind: "tool-call",
        runId: event.runId,
        toolCallId: event.payload.toolCallId,
        toolName: event.payload.toolName,
        summary: event.payload.summary,
        status: previous?.status === "awaiting_approval" ? previous.status : "running",
        anchorSequence: Math.min(previous?.anchorSequence ?? event.sequence, event.sequence),
        createdAt: previous?.createdAt ?? event.timestamp,
        updatedAt: event.timestamp,
        state: "running",
        ...(event.payload.inputPreview ? { inputPreview: event.payload.inputPreview } : {}),
      };
      break;
    }
    case "tool.call.progress": {
      const key = toolNodeKey(event.runId, event.payload.toolCallId);
      const existing = nodes[key];
      if (existing?.kind !== "tool-call") {
        applied = false;
        break;
      }
      nodes[key] = { ...existing, summary: event.payload.summary, updatedAt: event.timestamp };
      break;
    }
    case "tool.call.completed": {
      const key = toolNodeKey(event.runId, event.payload.toolCallId);
      const existing = nodes[key];
      if (existing?.kind !== "tool-call") {
        applied = false;
        break;
      }
      nodes[key] = {
        ...existing,
        status: "completed",
        state: "settled",
        updatedAt: event.timestamp,
        ...(event.payload.outputPreview ? { outputPreview: event.payload.outputPreview } : {}),
      };
      break;
    }
    case "tool.call.failed": {
      const key = toolNodeKey(event.runId, event.payload.toolCallId);
      const existing = nodes[key];
      if (existing?.kind !== "tool-call") {
        applied = false;
        break;
      }
      nodes[key] = {
        ...existing,
        status: "failed",
        state: "failed",
        updatedAt: event.timestamp,
        error: event.payload.error,
      };
      break;
    }
    case "tool.call.rejected": {
      const key = toolNodeKey(event.runId, event.payload.toolCallId);
      const existing = nodes[key];
      const previous = existing?.kind === "tool-call" ? existing : null;
      nodes[key] = {
        key,
        kind: "tool-call",
        runId: event.runId,
        toolCallId: event.payload.toolCallId,
        toolName: previous?.toolName ?? event.payload.toolName,
        summary: previous?.summary ?? event.payload.summary,
        status: "rejected",
        anchorSequence: Math.min(previous?.anchorSequence ?? event.sequence, event.sequence),
        createdAt: previous?.createdAt ?? event.timestamp,
        updatedAt: event.timestamp,
        state: "settled",
        error: event.payload.reason,
        ...(previous?.inputPreview ? { inputPreview: previous.inputPreview } : {}),
      };
      break;
    }
    case "approval.requested": {
      const key = toolNodeKey(event.runId, event.payload.toolCallId);
      const existing = nodes[key];
      const previous = existing?.kind === "tool-call" ? existing : null;
      nodes[key] = {
        key,
        kind: "tool-call",
        runId: event.runId,
        toolCallId: event.payload.toolCallId,
        toolName: previous?.toolName ?? event.payload.toolName,
        summary: previous?.summary ?? event.payload.summary,
        status: "awaiting_approval",
        anchorSequence: Math.min(previous?.anchorSequence ?? event.sequence, event.sequence),
        createdAt: previous?.createdAt ?? event.timestamp,
        updatedAt: event.timestamp,
        state: "running",
        ...(previous?.inputPreview ? { inputPreview: previous.inputPreview } : {}),
      };
      break;
    }
    case "approval.resolved": {
      const key = toolNodeKey(event.runId, event.payload.toolCallId);
      const existing = nodes[key];
      if (existing?.kind !== "tool-call") {
        applied = false;
        break;
      }
      const rejected = event.payload.decision === "deny";
      nodes[key] = {
        ...existing,
        status: rejected ? "rejected" : "running",
        state: rejected ? "settled" : "running",
        updatedAt: event.timestamp,
      };
      break;
    }
    case "task.started": {
      const key = taskNodeKey(event.runId, event.payload.taskId);
      nodes[key] = {
        key,
        kind: "task",
        runId: event.runId,
        taskId: event.payload.taskId,
        title: event.payload.title,
        agentId: event.payload.agentId,
        attempt: event.payload.attempt,
        summary: `由 ${event.payload.agentId} 执行`,
        status: "running",
        anchorSequence: event.sequence,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        state: "running",
      };
      break;
    }
    case "task.progress": {
      const key = taskNodeKey(event.runId, event.payload.taskId);
      const existing = nodes[key];
      if (existing?.kind !== "task") {
        applied = false;
        break;
      }
      nodes[key] = {
        ...existing,
        summary: event.payload.summary,
        updatedAt: event.timestamp,
      };
      break;
    }
    case "task.completed": {
      const key = taskNodeKey(event.runId, event.payload.taskId);
      const existing = nodes[key];
      if (existing?.kind !== "task") {
        applied = false;
        break;
      }
      nodes[key] = {
        ...existing,
        summary: event.payload.summary,
        status: "completed",
        state: "settled",
        updatedAt: event.timestamp,
      };
      break;
    }
    case "task.failed": {
      const key = taskNodeKey(event.runId, event.payload.taskId);
      const existing = nodes[key];
      if (existing?.kind !== "task") {
        applied = false;
        break;
      }
      nodes[key] = {
        ...existing,
        summary: event.payload.failure.message,
        status: "failed",
        state: "failed",
        error: event.payload.failure.message,
        updatedAt: event.timestamp,
      };
      break;
    }
  }

  if (!applied) return projection;
  return {
    order: mergeOrder(projection.order, nodes),
    nodes,
    turns,
    processedEventIds: {
      ...projection.processedEventIds,
      [event.eventId]: true,
    },
  };
}

export function assembleConversation(
  events: readonly ConversationEvent[],
): ConversationProjection {
  return events.reduce(applyConversationEvent, createEmptyConversationProjection());
}

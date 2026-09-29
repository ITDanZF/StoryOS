import { useCallback, useEffect, useState } from "react";
import type { OutlineProposal } from "../../../shared/contracts/outline/outlineContracts.ts";
import { getErrorMessage } from "../../lib/error.ts";
import {
  assignChapter,
  chapterOptions,
  documentFromSnapshot,
  planNextNode,
  removeRelation,
  replaceNode,
  sampleDocument,
  toUpdateInput,
  upsertRelation,
  type ChapterOption,
  type GraphDocument,
  type GraphNode,
  type GraphRelation,
  type NextNodeInput,
  type ProseBrief,
} from "./model/document.ts";

export default function useEventGraphSession(projectId: string) {
  const [document, setDocument] = useState<GraphDocument>(() => sampleDocument());
  const [workspaceChapters, setWorkspaceChapters] = useState<readonly ChapterOption[]>([]);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposal, setProposal] = useState<OutlineProposal | null>(null);

  const applySnapshot = useCallback((snapshot: NonNullable<Awaited<ReturnType<typeof window.storyOSAgent.getOutlineSnapshot>>>) => {
    setDocument(documentFromSnapshot(snapshot));
  }, []);

  const reload = useCallback(async () => {
    const snapshot = await window.storyOSAgent.getOutlineSnapshot(projectId);
    if (snapshot) applySnapshot(snapshot);
    return snapshot;
  }, [applySnapshot, projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const api = window.storyOSAgent;
        const [snapshot, workspace] = await Promise.all([
          typeof api.getOutlineSnapshot === "function" ? api.getOutlineSnapshot(projectId) : null,
          typeof api.getBookWorkspace === "function" ? api.getBookWorkspace(projectId).catch((): null => null) : null,
        ]);
        if (!active) return;
        if (workspace?.state === "ready") {
          setBookTitle(workspace.book.title);
          setWorkspaceChapters(workspace.chapters.map((chapter, index) => ({
            id: chapter.id,
            label: chapter.title.trim() || `第${index + 1}章`,
          })));
        }
        if (snapshot) applySnapshot(snapshot);
        else setDocument(sampleDocument());
      } catch (cause) {
        if (!active) return;
        setDocument(sampleDocument());
        setNotice(getErrorMessage(cause));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applySnapshot, projectId]);

  const chapters = chapterOptions(document, workspaceChapters);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      return true;
    } catch (cause) {
      setNotice(getErrorMessage(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const saveNode = useCallback((node: GraphNode) => {
    const current = document.nodes.find((item) => item.id === node.id);
    if (!current || node.proposal) return;
    if (document.source !== "outline" || !document.outlineId) {
      setDocument(assignChapter(replaceNode(document, node.id, node), node.id, node.chapterId));
      return;
    }
    void run(async () => {
      const updated = await window.storyOSAgent.updateOutlineNode({
        projectId,
        expectedRevision: document.revision,
        nodeId: node.id,
        changes: toUpdateInput(node),
      });
      let snapshot = updated.snapshot;
      if (node.chapterId !== current.chapterId) {
        if (current.chapterId) {
          snapshot = await window.storyOSAgent.unmapOutlineNode({
            projectId,
            expectedRevision: snapshot.outline.revision,
            nodeId: node.id,
          });
        }
        if (node.chapterId) {
          snapshot = await window.storyOSAgent.mapOutlineNodes({
            projectId,
            expectedRevision: snapshot.outline.revision,
            chapterId: node.chapterId,
            nodeIds: [node.id],
          });
        }
      }
      applySnapshot(snapshot);
    });
  }, [applySnapshot, document, projectId, run]);

  const createNext = useCallback((fromId: string, input: NextNodeInput) => {
    const tempId = `temp-${crypto.randomUUID()}`;
    const planned = planNextNode(document, fromId, input, tempId);
    if (document.source !== "outline" || !document.outlineId) {
      setDocument(planned.document);
      return tempId;
    }
    void run(async () => {
      const applied = await window.storyOSAgent.applyOutlinePatch({
        projectId,
        patch: {
          outlineId: document.outlineId ?? "",
          expectedRevision: document.revision,
          operations: planned.operations,
        },
      });
      applySnapshot(applied.snapshot);
    });
    return null;
  }, [applySnapshot, document, projectId, run]);

  const saveRelation = useCallback((relation: GraphRelation) => {
    if (relation.from === relation.to) {
      setNotice("关系不能指向自己");
      return;
    }
    if (document.source !== "outline" || !document.outlineId) {
      setDocument(upsertRelation(document, relation));
      return;
    }
    void run(async () => {
      const applied = await window.storyOSAgent.applyOutlinePatch({
        projectId,
        patch: {
          outlineId: document.outlineId ?? "",
          expectedRevision: document.revision,
          operations: [{
            type: "upsert_relation",
            value: {
              id: relation.id,
              sourceNodeId: relation.from,
              targetNodeId: relation.to,
              type: relation.type,
              description: relation.description,
              orderException: relation.orderException,
            },
          }],
        },
      });
      applySnapshot(applied.snapshot);
    });
  }, [applySnapshot, document, projectId, run]);

  const deleteRelation = useCallback((relationId: string) => {
    if (document.source !== "outline" || !document.outlineId) {
      setDocument(removeRelation(document, relationId));
      return;
    }
    void run(async () => {
      const applied = await window.storyOSAgent.applyOutlinePatch({
        projectId,
        patch: {
          outlineId: document.outlineId ?? "",
          expectedRevision: document.revision,
          operations: [{ type: "delete_relation", relationId }],
        },
      });
      applySnapshot(applied.snapshot);
    });
  }, [applySnapshot, document, projectId, run]);

  const submit = useCallback((instruction: string, focusNodeIds: readonly string[]) => {
    const text = instruction.trim();
    if (text === "") return Promise.resolve(false);
    return run(async () => {
      let current = document;
      if (current.source !== "outline") {
        const created = await window.storyOSAgent.createOutline({
          projectId,
          title: bookTitle.trim() || current.title || "事件图",
          premise: text,
          theme: "",
          coreConflict: "",
          climaxSummary: "",
          endingIntent: "",
        });
        current = documentFromSnapshot(created);
        setDocument(current);
      }
      const known = new Set(current.nodes.map((node) => node.id));
      const focus = focusNodeIds.filter((id) => known.has(id));
      const next = await window.storyOSAgent.proposeOutline({
        projectId,
        planningMode: "sequential",
        parentNodeId: focus.length === 1 ? focus[0] ?? null : null,
        instruction: text,
        focusNodeIds: focus,
      });
      setProposal(next);
    });
  }, [bookTitle, document, projectId, run]);

  const acceptProposal = useCallback(() => {
    if (!proposal || proposal.status !== "draft" || !document.outlineId) return;
    void run(async () => {
      const applied = await window.storyOSAgent.applyOutlinePatch({
        projectId,
        patch: proposal.patch,
      });
      applySnapshot(applied.snapshot);
      setProposal(null);
    });
  }, [applySnapshot, document.outlineId, projectId, proposal, run]);

  const writeProse = useCallback((brief: ProseBrief) => {
    if (!brief.chapterId || brief.blockers.length > 0) return;
    void run(async () => {
      const result = await window.storyOSAgent.startChapterWriting({
        projectId,
        chapterId: brief.chapterId ?? "",
        selection: brief.nodes.map((node) => node.id),
        mode: "append",
      });
      if (result.status === "written") setNotice(`已把 ${brief.nodes.length} 个节点写入${brief.chapterLabel ?? "这一章"}。`);
      else if (result.status === "too-large") setNotice("这几个节点合在一起太长，请少选几个再写。");
      else if (result.status === "choice") {
        setNotice(result.reason === "no-accepted-leaf"
          ? "要先确认叶子，并映射到这一章。"
          : "这本书还没有事件图。");
      } else setNotice(result.proposal.status === "draft" ? result.proposal.summary : "还不能写入正文。");
      await reload();
    });
  }, [projectId, reload, run]);

  return {
    document,
    chapters,
    loading,
    busy,
    notice,
    proposal,
    dismissNotice: () => setNotice(null),
    saveNode,
    createNext,
    saveRelation,
    deleteRelation,
    submit,
    acceptProposal,
    discardProposal: () => setProposal(null),
    writeProse,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BackfillScan,
  BackfillAcceptancePreview,
  GraphWritingPlan,
  OutlinePatch,
  OutlinePatchOperation,
  OutlinePlanningMode,
  OutlinePlanningScope,
  OutlineProposal,
  OutlineSnapshot,
  UpdateNodeInput,
} from "../../../shared/contracts/outline/outlineContracts.ts";
import { getErrorMessage } from "../../lib/error.ts";
import { readProposal, editProposalText } from "./model/proposalDiff.ts";
import {
  documentFromSnapshot,
  emptyDocument,
  type ChapterOption,
  type GraphDocument,
} from "./model/document.ts";

export type OutlineProfileInput = {
  readonly title: string;
  readonly premise: string;
  readonly theme: string;
  readonly coreConflict: string;
  readonly climaxSummary: string;
  readonly endingIntent: string;
};

export type ProposeInput = {
  readonly planningMode: OutlinePlanningMode;
  readonly parentNodeId: string | null;
  readonly instruction: string;
  readonly focusNodeIds: readonly string[];
  readonly scope: OutlinePlanningScope;
};

type RevisionConflict = {
  readonly expectedRevision: number;
  readonly currentRevision: number;
};

export default function useEventGraphSession(projectId: string) {
  const loadSequence = useRef(0);
  const loadedProject = useRef(projectId);
  const activeProject = useRef(projectId);
  activeProject.current = projectId;
  const [snapshot, setSnapshot] = useState<OutlineSnapshot | null>(null);
  const [chapters, setChapters] = useState<readonly ChapterOption[]>([]);
  const [volumes, setVolumes] = useState<readonly { readonly id: string; readonly title: string }[]>([]);
  const [bookTitle, setBookTitle] = useState("");
  const [bookReady, setBookReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposal, setProposal] = useState<OutlineProposal | null>(null);
  const [backfillScan, setBackfillScan] = useState<BackfillScan | null>(null);
  const [graphWritingPlan, setGraphWritingPlan] = useState<GraphWritingPlan | null>(null);
  const [graphWritingRunning, setGraphWritingRunning] = useState(false);
  const [focusNodeIds, setFocusNodeIds] = useState<readonly string[]>([]);
  const [lastPropose, setLastPropose] = useState<ProposeInput | null>(null);
  const [conflict, setConflict] = useState<RevisionConflict | null>(null);

  const document = useMemo<GraphDocument>(
    () => (snapshot ? documentFromSnapshot(snapshot) : emptyDocument(bookTitle)),
    [bookTitle, snapshot],
  );

  const applySnapshot = useCallback((next: OutlineSnapshot) => {
    if (activeProject.current !== projectId) return;
    setSnapshot(next);
    setLoadError(null);
  }, [projectId]);

  const reload = useCallback(async () => {
    const [next, workspace] = await Promise.all([
      window.storyOSAgent.getOutlineSnapshot(projectId),
      window.storyOSAgent.getBookWorkspace(projectId),
    ]);
    if (activeProject.current === projectId) {
      setSnapshot(next);
      if (workspace.state === "ready") {
        setVolumes(workspace.volumes.map((volume) => ({ id: volume.id, title: volume.title })));
        setChapters(workspace.chapters.map((chapter, index) => ({
          id: chapter.id, label: chapter.title.trim() || `第${index + 1}章`, currentRevisionId: chapter.currentRevisionId,
        })));
      }
    }
    return next;
  }, [projectId]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (loadedProject.current !== projectId) {
      loadedProject.current = projectId;
      setSnapshot(null);
      setChapters([]);
      setVolumes([]);
      setBookReady(false);
      setBookTitle("");
      setBusy(false);
      setNotice(null);
      setProposal(null);
      setBackfillScan(null);
      setGraphWritingPlan(null);
      setConflict(null);
      setLastPropose(null);
      setFocusNodeIds([]);
    }
    if (projectId.trim() === "") {
      setLoading(false);
      setLoadError("缺少项目");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const api = window.storyOSAgent;
      const workspace = await api.getBookWorkspace(projectId);
      if (sequence !== loadSequence.current) return;
      if (workspace.state === "uninitialized") {
        setSnapshot(null);
        setBackfillScan(null);
        setGraphWritingPlan(null);
        setBookReady(false);
        setBookTitle("");
        setChapters([]);
        setVolumes([]);
        return;
      }
      const [nextSnapshot, latestScan, latestPlan] = await Promise.all([
        api.getOutlineSnapshot(projectId),
        api.getLatestBackfillScan(projectId),
        api.getLatestGraphWritingPlan(projectId),
      ]);
      if (sequence !== loadSequence.current) return;
      setSnapshot(nextSnapshot);
      setBackfillScan(latestScan);
      setGraphWritingPlan(latestPlan);
      setBookReady(true);
      setBookTitle(workspace.book.title);
      setVolumes(workspace.volumes.map((volume) => ({ id: volume.id, title: volume.title })));
      setChapters(workspace.chapters.map((chapter, index) => ({
        id: chapter.id,
        label: chapter.title.trim() || `第${index + 1}章`,
        currentRevisionId: chapter.currentRevisionId,
      })));
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setSnapshot(null);
      setLoadError(getErrorMessage(cause));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!graphWritingRunning) return;
    const timer = window.setInterval(() => {
      void window.storyOSAgent.getLatestGraphWritingPlan(projectId).then((plan) => {
        if (activeProject.current === projectId) setGraphWritingPlan(plan);
      }).catch((): void => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [graphWritingRunning, projectId]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => {
      void window.storyOSAgent.getLatestBackfillScan(projectId).then((scan) => {
        if (activeProject.current === projectId && scan) setBackfillScan(scan);
      }).catch((): void => undefined);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [busy, projectId]);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      return activeProject.current === projectId;
    } catch (cause) {
      if (activeProject.current !== projectId) return false;
      const message = getErrorMessage(cause);
      if (message.includes("OutlineRevisionConflict")) {
        let next: OutlineSnapshot | null = null;
        try {
          next = await reload();
        } catch {
          next = null;
        }
        if (activeProject.current !== projectId) return false;
        setConflict({
          expectedRevision: proposal?.status === "draft" ? proposal.patch.expectedRevision : snapshot?.outline.revision ?? 0,
          currentRevision: next?.outline.revision ?? 0,
        });
        setNotice("大纲已经有新的修订，当前候选还留着。请重新生成，或放弃这份候选。");
        return false;
      }
      setNotice(message);
      return false;
    } finally {
      if (activeProject.current === projectId) setBusy(false);
    }
  }, [projectId, proposal, reload, snapshot?.outline.revision]);

  const createProfile = useCallback((input: OutlineProfileInput) => run(async () => {
    if (input.title.trim() === "" || input.premise.trim() === "") throw new Error("请先填写主线标题和故事构思。");
    const created = await window.storyOSAgent.createOutline({ projectId, ...input });
    applySnapshot(created);
  }), [applySnapshot, projectId, run]);

  const saveProfile = useCallback((input: OutlineProfileInput) => run(async () => {
    if (!snapshot) return;
    const saved = await window.storyOSAgent.updateOutlineProfile({
      projectId,
      expectedRevision: snapshot.outline.revision,
      ...input,
    });
    applySnapshot(saved);
  }), [applySnapshot, projectId, run, snapshot]);

  const propose = useCallback((input: ProposeInput) => run(async () => {
    if (!snapshot) throw new Error("请先建立全书设定。");
    const next = await window.storyOSAgent.proposeOutline({
      projectId,
      planningMode: input.planningMode,
      parentNodeId: input.parentNodeId,
      instruction: input.instruction,
      focusNodeIds: input.focusNodeIds,
      scope: input.scope,
      expectedOutlineRevision: snapshot.outline.revision,
    });
    if (activeProject.current !== projectId) return;
    setLastPropose(input);
    setFocusNodeIds(input.focusNodeIds);
    setConflict(null);
    if (next.status === "repairable") {
      setProposal(next);
      return;
    }
    try {
      await window.storyOSAgent.previewOutlinePatch({ projectId, patch: next.patch, scope: input.scope });
    } catch (cause) {
      if (activeProject.current !== projectId) return;
      setProposal({ status: "repairable", problems: [{ tempId: null as string | null, message: getErrorMessage(cause) }] });
      return;
    }
    if (activeProject.current !== projectId) return;
    const reading = readProposal(snapshot, next.patch, input.focusNodeIds);
    if (reading.unnamedCount > 0) {
      setProposal({
        status: "repairable",
        problems: reading.entries
          .filter((entry) => entry.unnamed)
          .map((entry) => ({ tempId: null as string | null, message: `候选改写了未点名的「${entry.title}」。` })),
      });
      return;
    }
    setProposal(next);
  }), [projectId, run, snapshot]);

  const acceptProposal = useCallback(() => run(async () => {
    if (!proposal || proposal.status !== "draft" || !snapshot) return;
    const reading = readProposal(snapshot, proposal.patch, focusNodeIds);
    if (reading.unnamedCount > 0) return;
    const applied = await window.storyOSAgent.applyOutlinePatch({ projectId, patch: proposal.patch, scope: proposal.scope });
    if (activeProject.current !== projectId) return;
    applySnapshot(applied.snapshot);
    setProposal(null);
    setConflict(null);
  }), [applySnapshot, focusNodeIds, projectId, proposal, run, snapshot]);

  const editProposal = useCallback((index: number, field: "title" | "goal" | "conflict" | "outcome", value: string) => {
    setProposal((current) => {
      if (!current || current.status !== "draft") return current;
      const patch = editProposalText(current.patch, index, field, value);
      return patch ? { ...current, patch } : current;
    });
  }, []);

  const applyOperations = useCallback((operations: readonly OutlinePatchOperation[]) => run(async () => {
    if (!snapshot) throw new Error("请先建立全书设定。");
    if (operations.length === 0) return;
    const applied = await window.storyOSAgent.applyOutlinePatch({
      projectId,
      patch: {
        outlineId: snapshot.outline.id,
        expectedRevision: snapshot.outline.revision,
        operations,
      },
    });
    applySnapshot(applied.snapshot);
  }), [applySnapshot, projectId, run, snapshot]);

  const updateNode = useCallback((nodeId: string, changes: UpdateNodeInput) => run(async () => {
    if (!snapshot) return;
    const updated = await window.storyOSAgent.updateOutlineNode({
      projectId,
      expectedRevision: snapshot.outline.revision,
      nodeId,
      changes,
    });
    applySnapshot(updated.snapshot);
  }), [applySnapshot, projectId, run, snapshot]);

  const saveChapterMapping = useCallback((nodeId: string, chapterId: string, segmentIntent: string, expectedLocalChange: string) => run(async () => {
    if (!snapshot) return;
    const next = await window.storyOSAgent.mapOutlineNodes({
      projectId,
      expectedRevision: snapshot.outline.revision,
      chapterId,
      mappings: [{ nodeId, segmentIntent, expectedLocalChange }],
    });
    applySnapshot(next);
  }), [applySnapshot, projectId, run, snapshot]);

  const removeChapterMapping = useCallback((nodeId: string, chapterId: string) => run(async () => {
    if (!snapshot) return;
    const next = await window.storyOSAgent.unmapOutlineNode({
      projectId,
      expectedRevision: snapshot.outline.revision,
      chapterId,
      nodeId,
    });
    applySnapshot(next);
  }), [applySnapshot, projectId, run, snapshot]);

  const scanExistingProse = useCallback((chapterIds?: readonly string[], volumeId?: string) => run(async () => {
    try {
      const scan = await window.storyOSAgent.scanBackfill({ projectId, ...(chapterIds ? { chapterIds } : {}), ...(volumeId ? { volumeId } : {}) });
      setBackfillScan(scan);
    } finally {
      try { setBackfillScan(await window.storyOSAgent.getLatestBackfillScan(projectId)); } catch { /* retain progress */ }
    }
  }), [projectId, run]);

  const cancelBackfill = useCallback(async () => {
    if (!backfillScan || backfillScan.status !== "scanning") return;
    try {
      setBackfillScan(await window.storyOSAgent.cancelBackfillScan({ projectId, scanId: backfillScan.scanId }));
    } catch (cause) {
      setNotice(getErrorMessage(cause));
    }
  }, [backfillScan, projectId]);

  const previewBackfillAcceptance = useCallback(async (scanId: string, candidateIds: readonly string[], confirmedUncertainIds: readonly string[], applySuggestedUpdatesFor: readonly string[]): Promise<BackfillAcceptancePreview | null> => {
    setBusy(true);
    setNotice(null);
    try {
      return await window.storyOSAgent.previewBackfillAcceptance({ projectId, scanId, candidateIds, confirmedUncertainIds, applySuggestedUpdatesFor });
    } catch (cause) {
      setNotice(getErrorMessage(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  const acceptBackfill = useCallback((scanId: string, candidateIds: readonly string[], confirmedUncertainIds: readonly string[] = [], applySuggestedUpdatesFor: readonly string[] = []) => run(async () => {
    const next = await window.storyOSAgent.acceptBackfill({ projectId, scanId, candidateIds, confirmedUncertainIds, applySuggestedUpdatesFor });
    applySnapshot(next);
    setBackfillScan(await window.storyOSAgent.getLatestBackfillScan(projectId));
  }), [applySnapshot, projectId, run]);

  const previewGraphWriting = useCallback((scope: GraphWritingPlan["scope"], chapterIds?: readonly string[], rewriteChapterIds: readonly string[] = []) => run(async () => {
    const plan = await window.storyOSAgent.previewGraphWritingPlan({ projectId, scope, ...(chapterIds ? { chapterIds } : {}), rewriteChapterIds });
    setGraphWritingPlan(plan);
  }), [projectId, run]);

  const startGraphWriting = useCallback(async () => {
    if (!graphWritingPlan) return false;
    setGraphWritingRunning(true);
    setNotice(null);
    try {
      const plan = await window.storyOSAgent.startGraphWritingPlan({ projectId, planId: graphWritingPlan.planId, previewDigest: graphWritingPlan.previewDigest });
      setGraphWritingPlan(plan);
      await reload();
      return true;
    } catch (cause) {
      setNotice(getErrorMessage(cause));
      try { setGraphWritingPlan(await window.storyOSAgent.getLatestGraphWritingPlan(projectId)); } catch { /* retain the last known plan */ }
      return false;
    } finally {
      setGraphWritingRunning(false);
    }
  }, [graphWritingPlan, projectId, reload]);

  const cancelGraphWriting = useCallback(async () => {
    if (!graphWritingPlan) return;
    try {
      const plan = await window.storyOSAgent.cancelGraphWritingPlan({ projectId, planId: graphWritingPlan.planId });
      setGraphWritingPlan(plan);
    } catch (cause) {
      setNotice(getErrorMessage(cause));
    }
  }, [graphWritingPlan, projectId]);

  const reading = proposal?.status === "draft" ? readProposal(snapshot, proposal.patch, focusNodeIds) : null;

  return {
    snapshot,
    document,
    chapters,
    volumes,
    bookTitle,
    bookReady,
    loading,
    loadError,
    busy,
    notice,
    proposal,
    backfillScan,
    graphWritingPlan,
    graphWritingRunning,
    reading,
    conflict,
    lastPropose,
    dismissNotice: () => setNotice(null),
    reload: load,
    createProfile,
    saveProfile,
    propose,
    acceptProposal,
    editProposal,
    discardProposal: () => {
      setProposal(null);
      setConflict(null);
    },
    regenerate: () => {
      if (lastPropose) return propose(lastPropose);
      return Promise.resolve(false);
    },
    applyOperations,
    updateNode,
    saveChapterMapping,
    removeChapterMapping,
    scanExistingProse,
    cancelBackfill,
    acceptBackfill,
    previewBackfillAcceptance,
    previewGraphWriting,
    startGraphWriting,
    cancelGraphWriting,
  };
}

export type { OutlinePatch };

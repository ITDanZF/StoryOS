import type AgentApplication from "../application/AgentApplication.ts";
import type ThreadApplication from "../application/ThreadApplication.ts";
import type { ApplicationEventHandler } from "../application/contracts.ts";
import type { ToolApprovalDecision } from "../security/ToolPolicy.ts";
import type SkillApplication from "../skills/SkillApplication.ts";

export type DesktopControllerDependencies = {
    readonly agent: AgentApplication;
    readonly threads: ThreadApplication;
    readonly skills: SkillApplication;
};

export default class DesktopController {
    constructor(private readonly dependencies: DesktopControllerDependencies) {}

    subscribe(handler: ApplicationEventHandler): () => void {
        return this.dependencies.agent.subscribe(handler);
    }

    sendMessage(request: { readonly threadId: string; readonly content: string }) {
        const threadId = request.threadId.trim();
        const content = request.content.trim();
        if (!threadId) throw new Error("Thread id is required.");
        if (!content) throw new Error("Message content is required.");

        this.dependencies.threads.appendMessage({ threadId, role: "user", content });
        const runId = this.dependencies.agent.startRun({ threadId, input: content });
        void this.dependencies.agent.waitForRun(runId).then((answer) => {
            this.dependencies.threads.appendMessage({
                threadId,
                role: "assistant",
                content: answer,
            });
        }).catch(() => {
            // Failed runs are reported through ApplicationEvent. Partial answers
            // are deliberately not persisted as conversation history.
        });
        return Object.freeze({ runId });
    }

    cancelRun(runId: string): boolean {
        return this.dependencies.agent.cancelRun(runId);
    }

    listRuns() {
        return this.dependencies.agent.listRuns();
    }

    resolveApproval(approvalId: string, decision: ToolApprovalDecision) {
        return this.dependencies.agent.resolveApproval(approvalId, decision);
    }

    getThreadSnapshot() {
        return this.dependencies.threads.getSnapshot();
    }

    listMessages(threadId?: string) {
        return this.dependencies.threads.listMessages(threadId);
    }

    createThread(title: string) {
        return this.dependencies.threads.createThread({ title });
    }

    switchThread(threadId: string) {
        return this.dependencies.threads.switchThread(threadId);
    }

    deleteThread(threadId: string) {
        return this.dependencies.threads.deleteThread(threadId);
    }

    getSkillSnapshot() {
        return this.dependencies.skills.getSnapshot();
    }

    getSkill(skillId: string) {
        return this.dependencies.skills.getSkill(skillId);
    }

    useSkill(skillId: string, threadId?: string) {
        return this.dependencies.threads.useSkill(skillId, threadId);
    }

    disableSkill(skillId: string, threadId?: string) {
        return this.dependencies.threads.disableSkill(skillId, threadId);
    }

    clearSkillState(threadId?: string) {
        return this.dependencies.threads.clearSkillState(threadId);
    }
}

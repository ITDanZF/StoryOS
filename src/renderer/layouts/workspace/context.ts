import { useOutletContext } from "react-router-dom";
import type { useAgentWorkspace } from "../../features/agent/hooks/useAgentWorkspace.ts";

export type WorkspaceOutletContext = ReturnType<typeof useAgentWorkspace> & {
  readonly openSidebar: () => void;
};

export function useWorkspaceOutlet(): WorkspaceOutletContext {
  return useOutletContext<WorkspaceOutletContext>();
}

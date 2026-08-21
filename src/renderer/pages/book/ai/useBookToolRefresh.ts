import { useEffect, useRef } from "react";
import type { ToolActivityView } from "../../../features/agent/types.ts";

const BOOK_MUTATION_TOOL_NAMES = new Set([
  "create_project_book",
  "update_book_profile",
  "create_book_volume",
  "update_book_volume",
  "delete_book_volume",
  "create_book_chapter",
  "update_book_chapter",
  "delete_book_chapter",
  "replace_book_chapter_text",
  "rewrite_book_chapter_text",
]);

type UseBookToolRefreshOptions = {
  readonly projectId: string | undefined;
  readonly activities: readonly ToolActivityView[];
  readonly reloadWorkspace: () => Promise<unknown>;
  readonly reloadNavigation: (projectId: string) => Promise<unknown>;
};

export default function useBookToolRefresh({
  projectId,
  activities,
  reloadWorkspace,
  reloadNavigation,
}: UseBookToolRefreshOptions): void {
  const appliedEventsRef = useRef(new Set<string>());

  useEffect(() => {
    const completed = activities.filter((activity) => {
      const eventKey = `${activity.id}:${activity.updatedAt}`;
      return activity.status === "completed" &&
        BOOK_MUTATION_TOOL_NAMES.has(activity.toolName) &&
        !appliedEventsRef.current.has(eventKey);
    });
    if (completed.length === 0) return;

    completed.forEach((activity) => {
      appliedEventsRef.current.add(`${activity.id}:${activity.updatedAt}`);
    });
    void Promise.all([
      reloadWorkspace(),
      projectId ? reloadNavigation(projectId) : Promise.resolve(null),
    ]);
  }, [activities, projectId, reloadNavigation, reloadWorkspace]);
}

import { z } from "zod";
import type { RestoreProjectArchiveDesktopRequest } from "../../../shared/agent/contracts.ts";
import { AGENT_IPC_CHANNELS } from "../../../shared/agent/contracts.ts";
import type {
  CreateProjectRequest,
  RenameProjectRequest,
} from "../../../shared/contracts/projects/projectContracts.ts";
import type DesktopController from "../DesktopController.ts";
import IpcRegistrar from "./IpcRegistrar.ts";
import { requireProjectArchiveBookStrategy, requireText } from "./validation.ts";
export default class ProjectIpcController {
  constructor(
    registrar: IpcRegistrar,
    getController: () => Pick<
      DesktopController,
      | "getProjectSnapshot"
      | "getProjectNavigation"
      | "getBookProjectArchives"
      | "restoreProjectArchive"
      | "createProject"
      | "openProject"
      | "openProjectDirectory"
      | "renameProject"
      | "deleteProject"
      | "switchProject"
      | "removeProject"
    >,
  ) {
    const handle = registrar.handle.bind(registrar) as IpcRegistrar["handle"];
    handle(AGENT_IPC_CHANNELS.projectSnapshot, () => getController().getProjectSnapshot());
    handle(AGENT_IPC_CHANNELS.projectNavigation, (projectId: string) =>
      getController().getProjectNavigation(requireText(projectId, "Project id")),
    );
    handle(AGENT_IPC_CHANNELS.bookProjectArchives, (bookId: string) =>
      getController().getBookProjectArchives(requireText(bookId, "Book id")),
    );
    handle(
      AGENT_IPC_CHANNELS.restoreProjectArchive,
      (request: RestoreProjectArchiveDesktopRequest) =>
        getController().restoreProjectArchive({
          archiveId: requireText(request?.archiveId, "Project archive id"),
          targetParentPath: requireText(request?.targetParentPath, "Project restore parent path"),
          projectName: requireText(request?.projectName, "Project restore name"),
          bookStrategy: requireProjectArchiveBookStrategy(request?.bookStrategy),
        }),
    );
    handle(AGENT_IPC_CHANNELS.createProject, (request: CreateProjectRequest) =>
      getController().createProject(
        z
          .object({
            name: z.string().trim().min(1),
            parentPath: z.string().trim().min(1).optional(),
            createAgentsFile: z.boolean().optional(),
            bookId: z.string().trim().min(1).optional(),
          })
          .parse(request),
      ),
    );
    handle(AGENT_IPC_CHANNELS.openProject, (projectPath: string) =>
      getController().openProject(requireText(projectPath, "Project path")),
    );
    handle(AGENT_IPC_CHANNELS.openProjectDirectory, (projectPath: string) =>
      getController().openProjectDirectory(requireText(projectPath, "Project path")),
    );
    handle(AGENT_IPC_CHANNELS.renameProject, (request: RenameProjectRequest) =>
      getController().renameProject(
        z
          .object({ projectPath: z.string().trim().min(1), name: z.string().trim().min(1) })
          .parse(request),
      ),
    );
    handle(AGENT_IPC_CHANNELS.deleteProject, (projectPath: string) =>
      getController().deleteProject(requireText(projectPath, "Project path")),
    );
    handle(AGENT_IPC_CHANNELS.switchProject, (projectPath: string | null) =>
      getController().switchProject(
        projectPath === null ? null : requireText(projectPath, "Project path"),
      ),
    );
    handle(AGENT_IPC_CHANNELS.removeProject, (projectPath: string) =>
      getController().removeProject(requireText(projectPath, "Project path")),
    );
  }
}

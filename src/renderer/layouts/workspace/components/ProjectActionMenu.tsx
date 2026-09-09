import { FolderOpen, Pencil, Trash2 } from "lucide-react";
import ActionMenu from "../../../components/ui/ActionMenu.tsx";
import { cn } from "../../../../lib/utils.ts";

type Props = {
  open: boolean; visible: boolean; projectName: string; onToggle: () => void; onClose: () => void;
  onOpenDirectory: () => Promise<void>; onRename: () => void; onDelete: () => Promise<void>;
};
export default function ProjectActionMenu(props: Props) {
  // The workspace operation owns async error presentation.
  const run = (action: () => Promise<void>) => () => { void action().catch((): void => undefined); };
  return <ActionMenu label={`${props.projectName} 项目操作`} open={props.open} onToggle={props.onToggle} onClose={props.onClose}
    triggerClassName={cn("focus:opacity-100 group-hover:opacity-100", props.visible || props.open ? "opacity-100" : "opacity-0")}
    items={[
      { id: "directory", label: "在文件资源管理器中打开", icon: <FolderOpen size={16} />, onSelect: run(props.onOpenDirectory) },
      { id: "rename", label: "重命名", icon: <Pencil size={16} />, onSelect: props.onRename },
      { id: "delete", label: "删除", icon: <Trash2 size={16} />, onSelect: run(props.onDelete), danger: true },
    ]} />;
}

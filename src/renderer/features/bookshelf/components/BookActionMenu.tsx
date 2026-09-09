import { ArchiveRestore, FileOutput, Trash2 } from "lucide-react";
import ActionMenu from "../../../components/ui/ActionMenu.tsx";

type Props = {
  title: string; bookId: string; linked: boolean; busy: boolean; open: boolean;
  onToggle: () => void; onClose: () => void;
  onExport: () => void; onArchives: () => void; onTrash: () => void;
};
export default function BookActionMenu(props: Props) {
  return <ActionMenu label={`管理《${props.title}》`} triggerData={{ "data-book-menu": props.bookId }} triggerClassName="shelf-more"
    menuClassName="shelf-action-menu" open={props.open} onToggle={props.onToggle} onClose={props.onClose} busy={props.busy}
    items={[
      { id: "export", label: "导出书籍", icon: <FileOutput size={18} />, onSelect: props.onExport },
      { id: "archives", label: "查看项目归档", icon: <ArchiveRestore size={18} />, onSelect: props.onArchives },
      { id: "trash", label: "移入回收站", icon: <Trash2 size={18} />, onSelect: props.onTrash, danger: true, separator: true,
        disabled: props.linked, description: props.linked ? "仍关联写作项目，暂不能移入回收站" : undefined },
    ]} />;
}

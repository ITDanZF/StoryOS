import { ArrowRight, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentConfigurationInput } from "../../../shared/contracts/settings/contracts.ts";
import type { StoryInstanceDto } from "../../../shared/contracts/instances/contracts.ts";
import { Button } from "../../components/ui/Button.tsx";
import { ConfirmDialog } from "../../components/ui/Dialog.tsx";
import WindowTitleBar from "../../components/WindowTitleBar.tsx";
import InstanceCard from "./InstanceCard.tsx";
import InstanceConfigurationDialog, {
  createInstanceDraft,
  editInstanceDraft,
} from "./InstanceConfigurationDialog.tsx";
import { useInstanceContext } from "./context.ts";

type DialogState = {
  readonly instance: StoryInstanceDto | null;
  readonly draft: ReturnType<typeof createInstanceDraft>;
};

export default function InstancePage() {
  const { snapshot, setSnapshot } = useInstanceContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoryInstanceDto | null>(null);

  const execute = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const open = (instance: StoryInstanceDto): void => { void execute(async () => {
    const result = await window.storyOSInstances.open(instance.id);
    setSnapshot(result.snapshot);
    navigate("/conversations", { replace: true });
  }); };
  const edit = (instance: StoryInstanceDto): void => { void execute(async () => {
    const configuration = await window.storyOSInstances.getConfiguration(instance.id);
    setDialog({ instance, draft: editInstanceDraft(instance, configuration) });
  }); };
  const instances = snapshot.instances.filter((instance) =>
    `${instance.name} ${instance.rootPath}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  return <main className="min-h-dvh bg-background pt-8 text-foreground">
    <WindowTitleBar />
    <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-12 sm:px-10">
      <header className="mb-9 flex items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">StoryOS 实例</h1><p className="mt-2 text-sm text-muted-foreground">选择工作空间</p></div>
        {snapshot.activeInstanceId && <Button type="button" onClick={() => navigate("/conversations")}>返回当前实例 <ArrowRight size={16} /></Button>}
      </header>
      <label className="mb-8 flex max-w-xl items-center gap-3 rounded-lg border border-border bg-card px-4 text-muted-foreground">
        <Search size={17} /><input aria-label="搜索实例" className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索实例名称或路径" />
      </label>
      {(error || snapshot.startupError) && <p className="mb-5 text-sm text-danger-text" role="alert">{error || snapshot.startupError}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button type="button" disabled={busy} onClick={() => { setDialog({ instance: null, draft: createInstanceDraft(snapshot.suggestedRootPath) }); setError(null); }} className="group flex min-h-44 flex-col justify-between rounded-lg border border-dashed border-border-strong bg-card p-5 text-left transition-[transform,background-color,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-ring hover:bg-surface-subtle hover:shadow-lg active:translate-y-0 active:scale-[0.99] active:shadow-sm">
          <Plus size={23} /><span><strong className="block text-sm">新建实例</strong><span className="mt-1 block text-xs text-muted-foreground">创建独立的 StoryOS 工作空间</span></span>
        </button>
        {instances.map((instance) => <InstanceCard
          key={instance.id}
          instance={instance}
          active={instance.id === snapshot.activeInstanceId}
          busy={busy}
          onOpen={() => open(instance)}
          onEdit={() => edit(instance)}
          onReveal={() => void execute(() => window.storyOSInstances.reveal(instance.id))}
          onRelocate={() => void execute(async () => {
            const selected = await window.storyOSWindow.pickDirectory({ title: `重新定位“${instance.name}”` });
            if (selected) setSnapshot(await window.storyOSInstances.relocate(instance.id, selected));
          })}
          onRemove={() => setPendingDelete(instance)}
        />)}
      </div>
    </div>
    {pendingDelete && <ConfirmDialog
      danger
      title={`删除实例“${pendingDelete.name}”？`}
      confirmLabel="删除"
      description={pendingDelete.id === snapshot.activeInstanceId
        ? `这是当前正在使用的实例。确认后会先关闭它，再从列表中移除。\n目录中的文件会保留：\n${pendingDelete.rootPath}`
        : `确认后，这个实例会从列表中移除。\n目录中的文件会保留：\n${pendingDelete.rootPath}`}
      onClose={() => setPendingDelete(null)}
      onConfirm={() => {
        const target = pendingDelete;
        setPendingDelete(null);
        void execute(async () => setSnapshot(await window.storyOSInstances.remove(target.id)));
      }}
    />}
    {dialog && <InstanceConfigurationDialog
      instance={dialog.instance}
      initialDraft={dialog.draft}
      onClose={() => setDialog(null)}
      onCreate={async (name: string, rootPath: string, configuration: AgentConfigurationInput) => {
        const result = await window.storyOSInstances.create({ name, rootPath, configuration });
        setSnapshot(result.snapshot);
        navigate("/conversations", { replace: true });
      }}
      onUpdate={async (instance, name, configuration) => {
        let next = await window.storyOSInstances.updateConfiguration(instance.id, configuration);
        if (name !== instance.name) next = await window.storyOSInstances.rename(instance.id, name);
        setSnapshot(next);
      }}
    />}
  </main>;
}
import { X } from "lucide-react";
import type { AgentConfigurationRequest, AgentServiceStatus } from "../../../../shared/agent/contracts.ts";
import { ConfigurationPanel } from "./ConfigurationPanel.tsx";

export { ConfigurationPanel } from "./ConfigurationPanel.tsx";

type ConfigurationDialogProps = {
  readonly status: AgentServiceStatus | null;
  readonly required: boolean;
  readonly onClose: () => void;
  readonly onConfigure: (request: AgentConfigurationRequest) => Promise<void>;
};

export default function ConfigurationDialog({ status, required, onClose, onConfigure }: ConfigurationDialogProps) {
  return (
    <div className="fixed inset-0 z-50 grid items-end bg-black/25 p-0 backdrop-blur-[3px] sm:place-items-center sm:p-6" role="presentation">
      <section className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="模型设置">
        {!required && <button className="absolute right-3 top-2 z-10 grid size-7 place-items-center rounded-lg hover:bg-muted" type="button" aria-label="关闭" onClick={onClose}><X size={16} /></button>}
        <ConfigurationPanel status={status} onConfigure={onConfigure} />
      </section>
    </div>
  );
}

import { FolderPlus, X } from 'lucide-react';
import { useState } from 'react';

type CreateProjectDialogProps = {
  readonly onClose: () => void;
  readonly onCreate: (name: string) => Promise<void>;
};

export default function CreateProjectDialog({ onClose, onCreate }: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(normalizedName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSubmitting(false);
    }
  };

  return (
    <div
      className='fixed inset-0 z-[90] grid place-items-center bg-black/20 p-4 backdrop-blur-[2px]'
      role='presentation'
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form className='w-full max-w-[360px] rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl' role='dialog' aria-modal='true' aria-labelledby='create-project-title' onSubmit={(event) => void submit(event)}>
        <div className='flex items-start gap-3'>
          <span className='grid size-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700'><FolderPlus size={18} /></span>
          <div className='min-w-0 flex-1'>
            <h2 className='m-0 text-sm font-semibold' id='create-project-title'>新建空白项目</h2>
            <p className='mb-0 mt-1 text-[11px] leading-5 text-neutral-500'>项目将创建在当前工作区目录中。</p>
          </div>
          <button className='grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-neutral-500 hover:bg-neutral-100' type='button' aria-label='关闭' onClick={onClose} disabled={submitting}><X size={16} /></button>
        </div>

        <label className='mt-4 grid gap-1.5 text-[11px] font-medium text-neutral-600'>
          <span>项目名称</span>
          <input className='h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-black/5' autoFocus maxLength={80} placeholder='例如：我的故事' value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        {error && <p className='mb-0 mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700'>{error}</p>}

        <div className='mt-5 flex justify-end gap-2'>
          <button className='h-9 cursor-pointer rounded-lg border border-neutral-200 bg-white px-4 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50' type='button' disabled={submitting} onClick={onClose}>取消</button>
          <button className='h-9 cursor-pointer rounded-lg border border-neutral-900 bg-neutral-900 px-4 text-xs font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50' type='submit' disabled={submitting || !name.trim()}>{submitting ? '正在创建…' : '创建项目'}</button>
        </div>
      </form>
    </div>
  );
}

import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function WindowTitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const windowApi = window.storyOSWindow;
    if (!windowApi) return;
    let disposed = false;
    void windowApi.getState().then((state) => {
      if (!disposed) setMaximized(state.maximized || state.fullScreen);
    });
    const unsubscribe = windowApi.onStateChanged((state) => {
      setMaximized(state.maximized || state.fullScreen);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const toggleMaximize = async () => {
    const windowApi = window.storyOSWindow;
    if (!windowApi) return;
    const state = await windowApi.toggleMaximize();
    setMaximized(state.maximized || state.fullScreen);
  };

  return (
    <header className='fixed inset-x-0 top-0 z-80 flex h-8 select-none items-center justify-between bg-white pl-3 text-neutral-900 [-webkit-app-region:drag]' onDoubleClick={() => void toggleMaximize()}>
      <span className='text-[11px] font-semibold tracking-[0.01em]'>StoryOS</span>
      <div className='flex self-stretch [-webkit-app-region:no-drag]' onDoubleClick={(event) => event.stopPropagation()}>
        <button className='grid h-8 w-[46px] place-items-center border-0 bg-transparent p-0 text-neutral-800 hover:bg-[#eeeeee]' type='button' aria-label='Minimize' title='Minimize' disabled={!window.storyOSWindow} onClick={() => void window.storyOSWindow?.minimize()}>
          <Minus size={15} strokeWidth={1.7} />
        </button>
        <button className='grid h-8 w-[46px] place-items-center border-0 bg-transparent p-0 text-neutral-800 hover:bg-[#eeeeee]' type='button' aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'} disabled={!window.storyOSWindow} onClick={() => void toggleMaximize()}>
          {maximized ? <Copy size={12} strokeWidth={1.6} /> : <Square size={12} strokeWidth={1.6} />}
        </button>
        <button className='grid h-8 w-[46px] place-items-center border-0 bg-transparent p-0 text-neutral-800 hover:bg-[#e81123] hover:text-white' type='button' aria-label='Close' title='Close' disabled={!window.storyOSWindow} onClick={() => window.storyOSWindow?.close()}>
          <X size={16} strokeWidth={1.7} />
        </button>
      </div>
    </header>
  );
}

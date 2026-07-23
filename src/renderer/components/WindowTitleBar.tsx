import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function WindowTitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let disposed = false;
    void window.storyOSWindow.getState().then((state) => {
      if (!disposed) setMaximized(state.maximized || state.fullScreen);
    });
    const unsubscribe = window.storyOSWindow.onStateChanged((state) => {
      setMaximized(state.maximized || state.fullScreen);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const toggleMaximize = async () => {
    const state = await window.storyOSWindow.toggleMaximize();
    setMaximized(state.maximized || state.fullScreen);
  };

  return (
    <header className='window-titlebar app-drag' onDoubleClick={() => void toggleMaximize()}>
      <span className='window-titlebar__title'>StoryOS</span>
      <div className='window-titlebar__controls app-no-drag' onDoubleClick={(event) => event.stopPropagation()}>
        <button type='button' aria-label='Minimize' title='Minimize' onClick={() => void window.storyOSWindow.minimize()}>
          <Minus size={15} strokeWidth={1.7} />
        </button>
        <button type='button' aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'} onClick={() => void toggleMaximize()}>
          {maximized ? <Copy size={12} strokeWidth={1.6} /> : <Square size={12} strokeWidth={1.6} />}
        </button>
        <button className='window-titlebar__close' type='button' aria-label='Close' title='Close' onClick={() => window.storyOSWindow.close()}>
          <X size={16} strokeWidth={1.7} />
        </button>
      </div>
    </header>
  );
}

import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App.tsx';
import { initializeFrontend } from './app/bootstrap.ts';
import { initializeTheme } from './app/theme/themeStore.ts';
initializeTheme();
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Renderer root element is missing.');
}

void initializeFrontend().then(() => createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>
));

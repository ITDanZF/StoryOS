import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Renderer root element is missing.');
}

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>
);

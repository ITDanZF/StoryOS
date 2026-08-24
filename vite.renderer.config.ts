import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(async () => {
    // eslint-disable-next-line import/no-unresolved -- package uses a Vite-only ESM export that this ESLint resolver cannot resolve.
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    return {
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
    };
});

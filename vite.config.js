import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/xlsx'))
                        return 'xlsx';
                    if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender'))
                        return 'charts';
                    if (id.includes('node_modules/react') || id.includes('node_modules/framer-motion'))
                        return 'react-vendor';
                },
            },
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8787',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});

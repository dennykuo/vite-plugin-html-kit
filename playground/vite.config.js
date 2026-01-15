import { defineConfig } from 'vite';
import vitePluginHtmlKit from '../src/index.js'; // Import from local source

export default defineConfig({
    root: '.', // Playground root
    plugins: [
        vitePluginHtmlKit({
            partialsDir: 'partials',
            data: {
                siteTitle: 'HTML Kit Playground',
                author: 'Developer'
            }
        })
    ],
    server: {
        open: true
    }
});

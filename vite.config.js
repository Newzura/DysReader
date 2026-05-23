import { defineConfig } from 'vite';

process.env.BROWSER = 'firefox';

export default defineConfig({
  base: '/DysReader/', 
  server: {
    port: 5173,
    host: true,
    open: true
  }
});

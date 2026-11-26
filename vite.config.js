import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({
    onwarn(warning, defaultHandler) {
      // Konva 时间轴为纯指针交互的自定义 SVG 控件，键盘操作通过播放条与快捷键提供
      if (warning.code === 'a11y_no_static_element_interactions' || warning.code === 'a11y_click_events_have_key_events') return;
      defaultHandler?.(warning);
    }
  })],
  server: { host: '127.0.0.1', port: 5173 },
  build: { target: 'es2020' }
});

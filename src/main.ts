import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { registerDebugFacade } from './fabric/debug'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
registerDebugFacade()

import './styles.css';
import './components/station-app';
import { store } from './store';

declare global {
  interface Window {
    __walkthroughStore: typeof store;
  }
}

window.__walkthroughStore = store;

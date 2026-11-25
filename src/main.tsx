import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// 不使用 StrictMode：Pixi Application 的异步 init 与双挂载卸载存在竞态
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

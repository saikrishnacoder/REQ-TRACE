import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { startDesktopBackend } from './services/desktop';
import './index.css';

void startDesktopBackend();

createRoot(document.getElementById('root')!).render(<App />);

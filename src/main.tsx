import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { startDesktopBackend } from './services/desktop';
import './index.css';

const root = createRoot(document.getElementById('root')!);
void startDesktopBackend()
  .then(() => root.render(<App />))
  .catch((error: unknown) => {
    console.error('ReqTrace desktop startup failed.', error);
    const message = error instanceof Error ? error.message : 'The local API could not be started.';
    root.render(
      <main style={{ maxWidth: 640, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1>ReqTrace could not start</h1>
        <p>{message}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </main>,
    );
  });

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

// Fade out the pre-React splash once the app has painted (the in-app LogoLoader takes over
// seamlessly if auth is still resolving). Wait a frame so React's first commit is on screen.
requestAnimationFrame(() => {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('is-hiding');
  setTimeout(() => splash.remove(), 400);
});

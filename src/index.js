import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import cloudSync from './services/cloudSync';

const root = ReactDOM.createRoot(document.getElementById('root'));
// Restore backed-up data before the app reads local storage; don't block
// startup for more than a few seconds if the backend is unreachable.
Promise.race([cloudSync.start(), new Promise(r => setTimeout(r, 4000))])
  .finally(() => root.render(<App />));

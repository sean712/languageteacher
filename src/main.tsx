import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './lib/auth';
import AppGate from './components/AppGate';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppGate>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </AppGate>
  </StrictMode>,
);

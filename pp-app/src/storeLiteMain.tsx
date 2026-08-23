import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StoreLiteApp } from './store-lite/StoreLiteApp';
import { StoreLiteAuthProvider } from './store-lite/StoreLiteAuth';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreLiteAuthProvider>
        <StoreLiteApp />
      </StoreLiteAuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { BrandLaunchScreen } from './components/BrandLaunchScreen';
import { StoreLiteApp } from './store-lite/StoreLiteApp';
import { StoreLiteAuthProvider } from './store-lite/StoreLiteAuth';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <BrandLaunchScreen />
      <StoreLiteAuthProvider>
        <StoreLiteApp />
      </StoreLiteAuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

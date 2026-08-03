import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/SelectedApp';
import { AppDataProvider } from './app/AppDataProvider';
import { OrderActionErrorBanner } from './components/OrderActionErrorBanner';
import { applyBrandPresentation } from './config/brand';
import './styles/index.css';

applyBrandPresentation(navigator.languages.length > 0 ? navigator.languages : [navigator.language]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppDataProvider>
        <OrderActionErrorBanner />
        <App />
      </AppDataProvider>
    </BrowserRouter>
  </StrictMode>,
);

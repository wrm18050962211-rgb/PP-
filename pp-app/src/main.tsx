import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { AppDataProvider } from './app/AppDataProvider';
import { OrderActionErrorBanner } from './components/OrderActionErrorBanner';
import './styles/index.css';

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

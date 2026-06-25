import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { AppDataProvider } from './app/AppDataProvider';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={getRouterBasename()}>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </BrowserRouter>
  </StrictMode>,
);

function getRouterBasename() {
  const baseUrl = import.meta.env.BASE_URL;
  return baseUrl === '/' ? undefined : baseUrl.replace(/\/$/, '');
}

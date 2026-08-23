import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreLiteAdminApp } from './StoreLiteAdminApp';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Store Lite Admin root element is missing.');

createRoot(root).render(
  <StrictMode>
    <StoreLiteAdminApp />
  </StrictMode>,
);

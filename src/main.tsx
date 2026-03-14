import React from 'react';
import ReactDOM from 'react-dom/client';
import { FamilyHubApp } from './FamilyHubApp';
import './styles.css';
import './theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FamilyHubApp />
  </React.StrictMode>
);

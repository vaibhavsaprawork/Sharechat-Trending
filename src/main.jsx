import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { AppChromeProvider } from './context/AppChromeContext.jsx';
import App from './App.jsx';
import './index.css';
import './styles/global.css';

const STORAGE_THEME = 'sharechat-theme';
const initialTheme =
  typeof localStorage !== 'undefined' &&
  localStorage.getItem(STORAGE_THEME) === 'light'
    ? 'light'
    : 'dark';
document.documentElement.setAttribute('data-theme', initialTheme);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppChromeProvider>
      <App />
      <Analytics />
    </AppChromeProvider>
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './floating-fields.css';
import './ui-polish.css';
import { initFloatingFields } from './floating-fields';

initFloatingFields();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


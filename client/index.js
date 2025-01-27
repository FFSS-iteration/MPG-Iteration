import App from './App.jsx';
import React from 'react';
import { render } from 'react-dom';
import store from './store.js';
import { Provider } from 'react-redux';
import "./styles.css";

render(
  <Provider store={store}>
    < App />
  </Provider>,

  document.getElementById('contents')
)
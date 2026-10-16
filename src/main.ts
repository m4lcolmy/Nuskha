import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { loadCatalog } from './lib/catalog/store.svelte.ts';

loadCatalog();
mount(App, { target: document.getElementById('app')! });

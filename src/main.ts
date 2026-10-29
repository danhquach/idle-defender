// Entry point: the base view fills the page.
import { start } from './ui/app.ts';

const app = document.getElementById('app');
if (!app) throw new Error('main: #app is missing');
start(app);
const version = document.createElement('p');
version.className = 'version';
version.textContent = `v${__APP_VERSION__} (${__BUILD_ID__})`;
app.append(version);

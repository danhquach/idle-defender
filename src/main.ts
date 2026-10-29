// Entry point: the art loads, then the base view fills the page.
import { start } from './ui/app.ts';
import { loadArt } from './ui/sprites.ts';

const app = document.getElementById('app');
if (!app) throw new Error('main: #app is missing');
const status = document.createElement('p');
status.className = 'load-status';
status.textContent = 'Loading…';
app.append(status);
const version = document.createElement('p');
version.className = 'version';
version.textContent = `v${__APP_VERSION__} (${__BUILD_ID__})`;
app.append(version);

loadArt().then(
  (art) => {
    status.remove();
    start(app, art);
  },
  (err: unknown) => {
    console.error(err);
    status.textContent = "The game's art didn't load. Check your connection and reload the page.";
  },
);

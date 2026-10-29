// Entry point. The game itself is built ticket by ticket (docs/design.md §14).
const app = document.getElementById('app');
if (app) {
  const title = document.createElement('h1');
  title.textContent = 'Idle Defender';
  const version = document.createElement('p');
  version.textContent = `v${__APP_VERSION__} (${__BUILD_ID__})`;
  app.append(title, version);
}

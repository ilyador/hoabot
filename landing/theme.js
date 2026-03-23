function getTheme() {
  var saved = localStorage.getItem('hoabot-landing-theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  var icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = t === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
}
function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme') || getTheme();
  var next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('hoabot-landing-theme', next);
  applyTheme(next);
}
applyTheme(getTheme());
document.addEventListener('DOMContentLoaded', function() {
  var btn = document.querySelector('.theme-toggle');
  if (btn) btn.addEventListener('click', toggleTheme);
});

// Tool search on the home page. Data comes from search-index.js (window.TOOLS).
(function () {
  const input = document.getElementById('search-input');
  const list = document.getElementById('search-results');
  if (!input || !list || !window.TOOLS) return;

  const MAX_RESULTS = 8;
  const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const tools = window.TOOLS.map(t => ({
    ...t,
    nameN: norm(t.name),
    hay: norm([t.name, t.description, t.keywords, t.category, t.toolbox, t.url].join(' ')),
  }));
  let results = [], active = -1;

  function score(t, q, words) {
    if (!words.every(w => t.hay.includes(w))) return -1;
    let s = 0;
    if (t.nameN === q) s += 100;
    else if (t.nameN.startsWith(q)) s += 60;
    else if (t.nameN.includes(q)) s += 40;
    s += words.filter(w => t.nameN.includes(w)).length * 10;
    if (t.ready) s += 5;
    return s;
  }

  function search(q) {
    const qn = norm(q.trim());
    if (!qn) return [];
    const words = qn.split(/\s+/);
    return tools
      .map(t => ({ t, s: score(t, qn, words) }))
      .filter(r => r.s >= 0)
      .sort((a, b) => b.s - a.s || a.t.name.localeCompare(b.t.name))
      .slice(0, MAX_RESULTS)
      .map(r => r.t);
  }

  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function render() {
    const q = input.value.trim();
    results = search(q);
    active = results.length ? 0 : -1;
    if (!q) { close(); return; }
    list.innerHTML = results.length
      ? results.map((t, i) => `
        <li role="option" id="search-opt-${i}" class="search-result${t.ready ? '' : ' soon'}" data-i="${i}">
          <a href="${t.url}" tabindex="-1">
            <span class="search-emoji">${t.emoji}</span>
            <span class="search-text"><strong>${esc(t.name)}</strong><span>${esc(t.description)}</span></span>
            <span class="search-meta">${t.toolboxEmoji} ${esc(t.toolbox)}${t.ready ? '' : ' · soon'}</span>
          </a>
        </li>`).join('')
      : '<li class="search-empty">No tools found</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight();
  }

  function highlight() {
    list.querySelectorAll('.search-result').forEach((el, i) => el.classList.toggle('active', i === active));
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', 'search-opt-' + active);
      document.getElementById('search-opt-' + active).scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      highlight();
    } else if (e.key === 'Enter') {
      if (active >= 0) { e.preventDefault(); location.href = results[active].url; }
    } else if (e.key === 'Escape') {
      if (input.value) { input.value = ''; close(); } else input.blur();
    }
  });
  list.addEventListener('mousemove', e => {
    const li = e.target.closest('.search-result');
    if (li && +li.dataset.i !== active) { active = +li.dataset.i; highlight(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#search')) close(); });
  document.addEventListener('keydown', e => {
    const typing = e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
})();

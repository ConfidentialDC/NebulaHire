/* ─────────────────────────────────────────────────────────────────────────────
   ResumeIQ · script.js
   Handles both Home (upload) and Dashboard pages.
───────────────────────────────────────────────────────────────────────────── */

/* ══════════════════ HOME PAGE ═════════════════════════════════════════════ */
(function initUpload() {
  const dropZone   = document.getElementById('dropZone');
  if (!dropZone) return;                        // not on home page

  const fileInput  = document.getElementById('fileInput');
  const fileName   = document.getElementById('fileName');
  const uploadBtn  = document.getElementById('uploadBtn');
  const resultPanel= document.getElementById('resultPanel');
  const errorPanel = document.getElementById('errorPanel');
  const resultClose= document.getElementById('resultClose');

  // ── File selection ──────────────────────────────────────────────────────
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
      fileName.textContent = file.name;
      uploadBtn.disabled = false;
    }
  });

  // ── Drag-and-drop ───────────────────────────────────────────────────────
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      fileInput.files = e.dataTransfer.files;
      fileName.textContent = file.name;
      uploadBtn.disabled = false;
    } else {
      showError('Please drop a PDF file.');
    }
  });

  // ── Click anywhere on drop zone to open picker ──────────────────────────
  dropZone.addEventListener('click', e => {
    if (e.target.tagName !== 'LABEL') fileInput.click();
  });

  // ── Upload ──────────────────────────────────────────────────────────────
  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    hideAll();
    uploadBtn.classList.add('loading');
    uploadBtn.disabled = true;

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const res  = await fetch('/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      showResult(data);
    } catch (err) {
      showError(err.message);
    } finally {
      uploadBtn.classList.remove('loading');
      uploadBtn.disabled = false;
    }
  });

  // ── Close result ────────────────────────────────────────────────────────
  resultClose?.addEventListener('click', () => {
    resultPanel.hidden = true;
    fileInput.value    = '';
    fileName.textContent = 'No file chosen';
    uploadBtn.disabled = true;
  });

  // ── Helpers ─────────────────────────────────────────────────────────────
  function hideAll() {
    resultPanel.hidden = true;
    errorPanel.hidden  = true;
  }

  function showResult(data) {
    document.getElementById('rName').textContent  = data.name  || '—';
    document.getElementById('rEmail').textContent = data.email || '—';
    document.getElementById('rPhone').textContent = data.phone || '—';

    const score = data.score ?? 0;
    document.getElementById('rScore').textContent = score + ' / 100';

    const bar = document.getElementById('scoreBar');
    bar.style.setProperty('--pct', '0%');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => bar.style.setProperty('--pct', score + '%'));
    });

    const tagsEl = document.getElementById('rSkills');
    tagsEl.innerHTML = '';
    (data.skills || []).forEach(s => {
      const span = document.createElement('span');
      span.className = 'skill-tag';
      span.textContent = s;
      tagsEl.appendChild(span);
    });
    if (!data.skills?.length) {
      tagsEl.innerHTML = '<span style="color:var(--text3);font-size:.8rem">None detected</span>';
    }

    resultPanel.hidden = false;
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showError(msg) {
    document.getElementById('errorMsg').textContent = msg;
    errorPanel.hidden = false;
  }
})();

/* ══════════════════ DASHBOARD PAGE ════════════════════════════════════════ */
(function initDashboard() {
  const candBody   = document.getElementById('candBody');
  if (!candBody) return;                        // not on dashboard

  const searchInput  = document.getElementById('searchInput');
  const tableCount   = document.getElementById('tableCount');
  const emptyState   = document.getElementById('emptyState');
  const totalCountEl = document.getElementById('totalCount');
  const avgScoreEl   = document.getElementById('avgScore');
  const topScoreEl   = document.getElementById('topScore');

  let allCandidates = [];

  // ── Fetch ───────────────────────────────────────────────────────────────
  async function loadCandidates() {
    try {
      const res  = await fetch('/candidates');
      const data = await res.json();
      allCandidates = data;
      updateStats(data);
      render(data);
    } catch {
      candBody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:3rem">Failed to load candidates.</td></tr>';
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  function updateStats(data) {
    totalCountEl.textContent = data.length;
    if (data.length === 0) {
      avgScoreEl.textContent = '—';
      topScoreEl.textContent = '—';
    } else {
      const avg = Math.round(data.reduce((s, c) => s + (c.score || 0), 0) / data.length);
      avgScoreEl.textContent = avg;
      topScoreEl.textContent = data[0]?.score ?? 0;
    }
  }

  // ── Render table ────────────────────────────────────────────────────────
  function render(data) {
    candBody.innerHTML = '';

    if (data.length === 0) {
      emptyState.hidden = false;
      tableCount.textContent = '';
      return;
    }
    emptyState.hidden = true;
    tableCount.textContent = `${data.length} candidate${data.length !== 1 ? 's' : ''}`;

    data.forEach((c, i) => {
      const score  = c.score ?? 0;
      const rank   = i + 1;
      const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const scoreClass= score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

      const skillsHtml = (c.skills || [])
        .slice(0, 6)
        .map(s => `<span class="skill-tag">${esc(s)}</span>`)
        .join('');
      const moreSkills = (c.skills?.length || 0) > 6
        ? `<span style="color:var(--text3);font-size:.72rem">+${c.skills.length - 6} more</span>`
        : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td><span class="cand-name">${esc(c.name || '—')}</span></td>
        <td>${esc(c.email || '—')}</td>
        <td>${esc(c.phone || '—')}</td>
        <td><div class="skill-tags">${skillsHtml}${moreSkills}</div></td>
        <td>
          <div class="score-pill">
            <div class="score-mini-bar">
              <div class="score-mini-fill" style="width:${score}%"></div>
            </div>
            <span class="score-val ${scoreClass}">${score}</span>
          </div>
        </td>
      `;
      candBody.appendChild(tr);
    });
  }

  // ── Search / filter ─────────────────────────────────────────────────────
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { render(allCandidates); return; }
    const filtered = allCandidates.filter(c => {
      const hay = [c.name, c.email, ...(c.skills || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
    render(filtered);
  });

  // ── Utils ────────────────────────────────────────────────────────────────
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  loadCandidates();
})();

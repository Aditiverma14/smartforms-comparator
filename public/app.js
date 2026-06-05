// State
let eccFile = null;
let s4File = null;
let allDifferences = [];
let currentFilter = 'all';
let currentSearch = '';
let resultData = null;

// DOM Elements
const eccDropZone = document.getElementById('eccDropZone');
const s4DropZone = document.getElementById('s4DropZone');
const eccFileInput = document.getElementById('eccFileInput');
const s4FileInput = document.getElementById('s4FileInput');
const compareBtn = document.getElementById('compareBtn');
const uploadSection = document.getElementById('uploadSection');
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');

// Initialize drag & drop and click handlers
function initUpload() {
    // ECC drop zone
    eccDropZone.addEventListener('click', () => eccFileInput.click());
    eccDropZone.addEventListener('dragover', (e) => { e.preventDefault(); eccDropZone.classList.add('dragover'); });
    eccDropZone.addEventListener('dragleave', () => eccDropZone.classList.remove('dragover'));
    eccDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        eccDropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0], 'ecc');
    });
    eccFileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0], 'ecc'); });

    // S4 drop zone
    s4DropZone.addEventListener('click', () => s4FileInput.click());
    s4DropZone.addEventListener('dragover', (e) => { e.preventDefault(); s4DropZone.classList.add('dragover'); });
    s4DropZone.addEventListener('dragleave', () => s4DropZone.classList.remove('dragover'));
    s4DropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        s4DropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0], 's4');
    });
    s4FileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0], 's4'); });

    // Compare button
    compareBtn.addEventListener('click', compareFiles);
}

function handleFile(file, type) {
    if (!file.name.endsWith('.xml')) {
        alert('Please upload an XML file');
        return;
    }

    if (type === 'ecc') {
        eccFile = file;
        document.getElementById('eccFileName').textContent = file.name;
        document.getElementById('eccFileInfo').hidden = false;
        eccDropZone.classList.add('has-file');
    } else {
        s4File = file;
        document.getElementById('s4FileName').textContent = file.name;
        document.getElementById('s4FileInfo').hidden = false;
        s4DropZone.classList.add('has-file');
    }

    updateCompareBtn();
}

function removeFile(type) {
    event.stopPropagation();
    if (type === 'ecc') {
        eccFile = null;
        document.getElementById('eccFileInfo').hidden = true;
        eccDropZone.classList.remove('has-file');
        eccFileInput.value = '';
    } else {
        s4File = null;
        document.getElementById('s4FileInfo').hidden = true;
        s4DropZone.classList.remove('has-file');
        s4FileInput.value = '';
    }
    updateCompareBtn();
}

function updateCompareBtn() {
    compareBtn.disabled = !(eccFile && s4File);
}

async function compareFiles() {
    uploadSection.hidden = true;
    loadingSection.hidden = false;
    resultsSection.hidden = true;

    const formData = new FormData();
    formData.append('eccFile', eccFile);
    formData.append('s4File', s4File);

    try {
        const response = await fetch('/api/compare', { method: 'POST', body: formData });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Comparison failed');
        }

        const result = await response.json();
        allDifferences = result.differences;
        resultData = result;
        renderResults(result);
        loadingSection.hidden = true;
        resultsSection.hidden = false;

        // Setup search
        document.getElementById('searchInput').addEventListener('input', debounce((e) => {
            currentSearch = e.target.value.toLowerCase();
            renderFilteredDiffs();
        }, 300));
    } catch (error) {
        alert('Error: ' + error.message);
        loadingSection.hidden = true;
        uploadSection.hidden = false;
    }
}

function resetView() {
    resultsSection.hidden = true;
    uploadSection.hidden = false;
    eccFile = null;
    s4File = null;
    allDifferences = [];
    currentFilter = 'all';
    currentSearch = '';
    document.getElementById('eccFileInfo').hidden = true;
    document.getElementById('s4FileInfo').hidden = true;
    eccDropZone.classList.remove('has-file');
    s4DropZone.classList.remove('has-file');
    eccFileInput.value = '';
    s4FileInput.value = '';
    updateCompareBtn();
}

function renderResults(result) {
    renderFileCards(result);
    renderSummary(result.summary);
    renderFilters(result.differences);
    renderDiffs(result.differences);
}

function renderFileCards(result) {
    const container = document.getElementById('fileCards');
    container.innerHTML = `
        <div class="file-card ecc">
            <div class="card-header">
                <h3>ECC SmartForm</h3>
                <span class="badge ecc-badge">ECC</span>
            </div>
            <div class="card-detail"><strong>File:</strong> ${escapeHtml(result.eccFile.name)}</div>
            <div class="card-detail"><strong>Form:</strong> ${escapeHtml(result.eccFile.header.FORMNAME || 'N/A')}</div>
            <div class="card-detail"><strong>Caption:</strong> ${escapeHtml(result.eccFile.header.CAPTION || 'N/A')}</div>
            <div class="card-detail"><strong>Last Modified:</strong> ${result.eccFile.header.LASTDATE || 'N/A'} ${result.eccFile.header.LASTTIME || ''}</div>
            <div class="card-detail"><strong>Last User:</strong> ${result.eccFile.header.LASTUSER || 'N/A'}</div>
            <div class="card-detail"><strong>Params:</strong> ${result.eccFile.stats.interfaceParams} | <strong>Vars:</strong> ${result.eccFile.stats.globalData} | <strong>Properties:</strong> ${result.eccFile.stats.formProperties}</div>
        </div>
        <div class="file-card s4">
            <div class="card-header">
                <h3>S4 HANA SmartForm</h3>
                <span class="badge s4-badge">S4</span>
            </div>
            <div class="card-detail"><strong>File:</strong> ${escapeHtml(result.s4File.name)}</div>
            <div class="card-detail"><strong>Form:</strong> ${escapeHtml(result.s4File.header.FORMNAME || 'N/A')}</div>
            <div class="card-detail"><strong>Caption:</strong> ${escapeHtml(result.s4File.header.CAPTION || 'N/A')}</div>
            <div class="card-detail"><strong>Last Modified:</strong> ${result.s4File.header.LASTDATE || 'N/A'} ${result.s4File.header.LASTTIME || ''}</div>
            <div class="card-detail"><strong>Last User:</strong> ${result.s4File.header.LASTUSER || 'N/A'}</div>
            <div class="card-detail"><strong>Params:</strong> ${result.s4File.stats.interfaceParams} | <strong>Vars:</strong> ${result.s4File.stats.globalData} | <strong>Properties:</strong> ${result.s4File.stats.formProperties}</div>
        </div>
    `;
}

function renderSummary(summary) {
    const container = document.getElementById('summaryStats');
    container.innerHTML = `
        <div class="stat-card total">
            <div class="stat-number">${summary.total}</div>
            <div class="stat-label">Total Changes</div>
        </div>
        <div class="stat-card added">
            <div class="stat-number">${summary.added}</div>
            <div class="stat-label">Added in S4</div>
        </div>
        <div class="stat-card removed">
            <div class="stat-number">${summary.removed}</div>
            <div class="stat-label">Removed in S4</div>
        </div>
        <div class="stat-card modified">
            <div class="stat-number">${summary.modified}</div>
            <div class="stat-label">Modified</div>
        </div>
    `;
}

function renderFilters(differences) {
    const container = document.getElementById('filterBar');
    const categories = [...new Set(differences.map(d => d.category))].sort();
    
    let html = `<button class="filter-btn active" onclick="filterBy('all', this)">All (${differences.length})</button>`;
    categories.forEach(cat => {
        const count = differences.filter(d => d.category === cat).length;
        html += `<button class="filter-btn" onclick="filterBy('${escapeHtml(cat)}', this)">${escapeHtml(cat)} (${count})</button>`;
    });
    html += `<button class="expand-toggle" onclick="toggleAllDiffs()">Expand / Collapse All</button>`;
    
    container.innerHTML = html;
}

function renderFilteredDiffs() {
    let filtered = allDifferences;
    
    if (currentFilter !== 'all') {
        filtered = filtered.filter(d => d.category === currentFilter);
    }
    
    if (currentSearch) {
        filtered = filtered.filter(d => {
            return (d.location && d.location.toLowerCase().includes(currentSearch)) ||
                   (d.detail && d.detail.toLowerCase().includes(currentSearch)) ||
                   (d.oldValue && d.oldValue.toLowerCase().includes(currentSearch)) ||
                   (d.newValue && d.newValue.toLowerCase().includes(currentSearch)) ||
                   (d.category && d.category.toLowerCase().includes(currentSearch));
        });
    }

    renderDiffs(filtered);
}

function renderDiffs(differences) {
    const container = document.getElementById('diffResults');

    if (differences.length === 0) {
        container.innerHTML = `
            <div class="no-diffs">
                <h2>&#x2705; No Differences Found</h2>
                <p>${currentSearch ? 'No matches for your search.' : 'Both SmartForm XML files are identical in structure and content.'}</p>
            </div>
        `;
        return;
    }

    // Group by category
    const grouped = {};
    differences.forEach(d => {
        if (!grouped[d.category]) grouped[d.category] = [];
        grouped[d.category].push(d);
    });

    let html = '';
    Object.keys(grouped).sort().forEach(category => {
        const items = grouped[category];
        html += `<div class="diff-category" data-category="${escapeHtml(category)}">`;
        html += `<div class="diff-category-header">${escapeHtml(category)} <span class="count">${items.length}</span></div>`;
        
        items.forEach((diff, idx) => {
            const id = `diff-${category.replace(/[^a-zA-Z0-9]/g, '-')}-${idx}`;
            html += `
                <div class="diff-item" data-type="${diff.type}" id="${id}">
                    <div class="diff-item-header" onclick="toggleDiff('${id}')">
                        <span class="diff-badge ${diff.type}">${diff.type}</span>
                        <span class="diff-location" title="${escapeHtml(diff.location)}">${escapeHtml(diff.location)}</span>
                        <span class="diff-detail">${escapeHtml(diff.detail)}</span>
                        <span class="diff-chevron">&#x25B6;</span>
                    </div>
                    <div class="diff-body">
                        <div class="diff-compare">
                            <div class="diff-value old">
                                <h4>&#x1F534; ECC (Original)</h4>
                                <pre>${diff.oldValue !== null ? escapeHtml(diff.oldValue) : '<em style="color:var(--text-muted)">(not present)</em>'}</pre>
                            </div>
                            <div class="diff-value new">
                                <h4>&#x1F7E2; S4 HANA (Changed)</h4>
                                <pre>${diff.newValue !== null ? escapeHtml(diff.newValue) : '<em style="color:var(--text-muted)">(not present)</em>'}</pre>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    });

    container.innerHTML = html;
}

function toggleDiff(id) {
    const el = document.getElementById(id);
    el.classList.toggle('open');
}

function toggleAllDiffs() {
    const items = document.querySelectorAll('.diff-item');
    const anyOpen = Array.from(items).some(i => i.classList.contains('open'));
    items.forEach(i => {
        if (anyOpen) i.classList.remove('open');
        else i.classList.add('open');
    });
}

function filterBy(category, btn) {
    currentFilter = category;
    // Update active button
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFilteredDiffs();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Initialize
initUpload();
initTheme();

function initTheme() {
    const saved = localStorage.getItem('sf-theme');
    // Default to light theme
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    document.getElementById('themeToggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        if (current === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('sf-theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('sf-theme', 'dark');
        }
    });
}

function switchView(view, btn) {
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    const diffSection = document.getElementById('diffResults');
    const filterBar = document.getElementById('filterBar');
    const searchBar = document.querySelector('.search-bar');
    const layoutView = document.getElementById('layoutView');

    if (view === 'diff') {
        diffSection.hidden = false;
        filterBar.hidden = false;
        searchBar.hidden = false;
        layoutView.hidden = true;
    } else {
        diffSection.hidden = true;
        filterBar.hidden = true;
        searchBar.hidden = true;
        layoutView.hidden = false;
        renderLayoutView();
    }
}

function renderLayoutView() {
    if (!resultData) return;
    const container = document.getElementById('layoutView');
    const eccProps = resultData.eccProperties || {};
    const s4Props = resultData.s4Properties || {};

    // Get all paths from both, focus on layout-related properties
    const allPaths = [...new Set([...Object.keys(eccProps), ...Object.keys(s4Props)])].sort();

    let html = `
        <div class="layout-filter">
            <input type="text" id="layoutSearch" placeholder="Filter... (e.g. MAIN, HEADER, Height, Width)" oninput="filterLayout()" />
            <label><input type="checkbox" id="layoutChangedOnly" onchange="filterLayout()"> Show changed only</label>
            <label><input type="checkbox" id="layoutDimsOnly" onchange="filterLayout()" checked> Layout properties only</label>
        </div>
        <table class="layout-table">
            <thead>
                <tr>
                    <th>Property Location</th>
                    <th>ECC Value</th>
                    <th>S4 HANA Value</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody id="layoutTableBody">
    `;

    allPaths.forEach(path => {
        const v1 = eccProps[path] || '';
        const v2 = s4Props[path] || '';
        const changed = v1 !== v2;
        const isDimension = /Height|Width|Top|Left|Border|WHEIGHT|WWIDTH|WTOP|WLEFT/i.test(path);

        html += `<tr class="${changed ? 'row-changed' : ''}" data-path="${escapeHtml(path)}" data-changed="${changed}" data-dimension="${isDimension}">
            <td class="prop-path" title="${escapeHtml(path)}">${escapeHtml(path)}</td>
            <td class="val-cell val-ecc">${escapeHtml(v1) || '<em>—</em>'}</td>
            <td class="val-cell val-s4">${escapeHtml(v2) || '<em>—</em>'}</td>
            <td>${changed ? '<span class="change-indicator">&#x26A0; CHANGED</span>' : '&#x2714;'}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Apply initial filter
    filterLayout();
}

function filterLayout() {
    const search = (document.getElementById('layoutSearch')?.value || '').toLowerCase();
    const changedOnly = document.getElementById('layoutChangedOnly')?.checked || false;
    const dimsOnly = document.getElementById('layoutDimsOnly')?.checked || false;

    const rows = document.querySelectorAll('#layoutTableBody tr');
    rows.forEach(row => {
        const path = (row.dataset.path || '').toLowerCase();
        const changed = row.dataset.changed === 'true';
        const isDim = row.dataset.dimension === 'true';

        let show = true;
        if (search && !path.includes(search)) show = false;
        if (changedOnly && !changed) show = false;
        if (dimsOnly && !isDim) show = false;

        row.style.display = show ? '' : 'none';
    });
}

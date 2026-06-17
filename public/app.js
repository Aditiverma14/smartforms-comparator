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
    renderLayoutSummary(result);
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

function renderLayoutSummary(result) {
    // This is now called from renderResults to store data, actual render happens in switchView
}

function renderSizeView() {
    if (!resultData) return;
    const container = document.getElementById('sizeView');
    const eccProps = resultData.eccProperties || {};
    const s4Props = resultData.s4Properties || {};

    // Collect all layout entries (Height, Width, Top, Left) grouped by window
    const windows = {};

    const allPaths = [...new Set([...Object.keys(eccProps), ...Object.keys(s4Props)])];
    allPaths.forEach(path => {
        const match = path.match(/^(.+?)\s*>\s*(Height|Width|Top|Left)\s*\(W(HEIGHT|WIDTH|TOP|LEFT)\)$/);
        if (!match) return;

        const windowPath = match[1];
        const prop = match[2]; // Height, Width, Top, Left

        if (!windows[windowPath]) {
            windows[windowPath] = { ecc: {}, s4: {} };
        }
        windows[windowPath].ecc[prop] = eccProps[path] || '—';
        windows[windowPath].s4[prop] = s4Props[path] || '—';
    });

    if (Object.keys(windows).length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <div class="summary-section">
            <h3 class="summary-title">&#x1F4D0; Layout Summary — Window Dimensions (Height / Width / Top / Left)</h3>
            <table class="layout-table">
                <thead>
                    <tr>
                        <th>Window / Node</th>
                        <th>Property</th>
                        <th>ECC Value</th>
                        <th>S4 HANA Value</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>`;

    Object.keys(windows).sort().forEach(windowPath => {
        const w = windows[windowPath];
        const shortPath = windowPath.replace('Form > ', '');
        const props = ['Left', 'Top', 'Width', 'Height'];

        props.forEach((prop, idx) => {
            const eccVal = w.ecc[prop] || '—';
            const s4Val = w.s4[prop] || '—';
            const changed = eccVal !== s4Val;
            const rowClass = changed ? 'row-changed' : '';
            const status = changed ? '<span class="change-indicator">&#x26A0; CHANGED</span>' : '<span style="color:var(--accent-green)">&#x2714;</span>';

            html += `<tr class="${rowClass}">`;
            if (idx === 0) {
                html += `<td class="prop-path" rowspan="4">${escapeHtml(shortPath)}</td>`;
            }
            html += `<td><strong>${prop}</strong></td>
                <td class="val-cell val-ecc">${eccVal}</td>
                <td class="val-cell val-s4">${s4Val}</td>
                <td>${status}</td>
            </tr>`;
        });
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderConditionsView() {
    if (!resultData) return;
    const container = document.getElementById('conditionsView');
    const eccProps = resultData.eccProperties || {};
    const s4Props = resultData.s4Properties || {};

    // Collect all condition entries
    const conditions = {};

    const allPaths = [...new Set([...Object.keys(eccProps), ...Object.keys(s4Props)])];
    allPaths.forEach(path => {
        if (!path.includes('Condition:')) return;

        // Extract condition path and rule number
        const match = path.match(/^(.+?Condition:[^>]+)>\s*Rule\[(\d+)\]$/);
        if (!match) return;

        const condPath = match[1].trim();
        const ruleNum = match[2];

        if (!conditions[condPath]) {
            conditions[condPath] = { rules: {} };
        }
        if (!conditions[condPath].rules[ruleNum]) {
            conditions[condPath].rules[ruleNum] = { ecc: null, s4: null };
        }
        conditions[condPath].rules[ruleNum].ecc = eccProps[path] || null;
        conditions[condPath].rules[ruleNum].s4 = s4Props[path] || null;
    });

    if (Object.keys(conditions).length === 0) {
        container.innerHTML = '<div class="no-diffs"><h2>No Conditions Found</h2><p>No condition nodes found in either file.</p></div>';
        return;
    }

    // Categorize conditions
    const categories = { changed: [], removed: [], added: [], same: [] };
    Object.keys(conditions).sort().forEach(condPath => {
        const cond = conditions[condPath];
        const ruleKeys = Object.keys(cond.rules);
        let status = 'same';

        for (const rk of ruleKeys) {
            const r = cond.rules[rk];
            if (r.ecc === null && r.s4 !== null) { status = 'added'; break; }
            if (r.ecc !== null && r.s4 === null) { status = 'removed'; break; }
            if (r.ecc !== r.s4) { status = 'changed'; break; }
        }

        categories[status].push({ path: condPath, rules: cond.rules, status });
    });

    const totalChanged = categories.changed.length + categories.removed.length + categories.added.length;

    let html = `
        <div class="summary-section">
            <h3 class="summary-title">&#x2753; Conditions Summary</h3>
            <div class="cond-stats">
                <span class="cond-stat total">${Object.keys(conditions).length} Total</span>
                <span class="cond-stat changed">${categories.changed.length} Changed</span>
                <span class="cond-stat removed">${categories.removed.length} Only in ECC</span>
                <span class="cond-stat added">${categories.added.length} Only in S4</span>
                <span class="cond-stat same">${categories.same.length} Same</span>
            </div>
            <div class="cond-filters">
                <label><input type="checkbox" id="condShowChanged" checked onchange="filterConditions()"> Changed</label>
                <label><input type="checkbox" id="condShowRemoved" checked onchange="filterConditions()"> Only in ECC (Removed)</label>
                <label><input type="checkbox" id="condShowAdded" checked onchange="filterConditions()"> Only in S4 (Added)</label>
                <label><input type="checkbox" id="condShowSame" onchange="filterConditions()"> Same (no change)</label>
            </div>`;

    // Render each condition as a card
    const allConds = [...categories.changed, ...categories.removed, ...categories.added, ...categories.same];
    
    allConds.forEach((cond, idx) => {
        const shortPath = cond.path.replace('Form > ', '');
        // Extract just condition name
        const condName = shortPath.match(/Condition:([^>]+)/)?.[1]?.trim() || 'Unknown';
        // Extract parent (page > window)
        const parent = shortPath.replace(/\s*>\s*Condition:.+$/, '');
        const ruleKeys = Object.keys(cond.rules).sort((a, b) => Number(a) - Number(b));

        let statusBadge = '';
        let statusClass = '';
        if (cond.status === 'changed') { statusBadge = '<span class="diff-badge modified">CHANGED</span>'; statusClass = 'cond-changed'; }
        else if (cond.status === 'removed') { statusBadge = '<span class="diff-badge removed">ONLY IN ECC</span>'; statusClass = 'cond-removed'; }
        else if (cond.status === 'added') { statusBadge = '<span class="diff-badge added">ONLY IN S4</span>'; statusClass = 'cond-added'; }
        else { statusBadge = '<span class="diff-badge" style="background:var(--bg-tertiary);color:var(--text-muted)">SAME</span>'; statusClass = 'cond-same'; }

        html += `
            <div class="cond-card ${statusClass}" data-status="${cond.status}">
                <div class="cond-card-header">
                    ${statusBadge}
                    <span class="cond-name">${escapeHtml(condName)}</span>
                    <span class="cond-parent">${escapeHtml(parent)}</span>
                </div>
                <div class="cond-card-body">
                    <table class="cond-rules-table">
                        <tr><th>Rule</th><th>ECC</th><th>S4 HANA</th></tr>`;

        ruleKeys.forEach(rk => {
            const r = cond.rules[rk];
            const eccVal = r.ecc || '—';
            const s4Val = r.s4 || '—';
            const rChanged = eccVal !== s4Val;
            html += `<tr class="${rChanged ? 'rule-changed' : ''}">
                <td>${rk}</td>
                <td class="val-ecc">${escapeHtml(eccVal)}</td>
                <td class="val-s4">${escapeHtml(s4Val)}</td>
            </tr>`;
        });

        html += `</table></div></div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
    filterConditions();
}

function filterConditions() {
    const showChanged = document.getElementById('condShowChanged')?.checked;
    const showRemoved = document.getElementById('condShowRemoved')?.checked;
    const showAdded = document.getElementById('condShowAdded')?.checked;
    const showSame = document.getElementById('condShowSame')?.checked;

    document.querySelectorAll('.cond-card').forEach(card => {
        const status = card.dataset.status;
        let show = false;
        if (status === 'changed' && showChanged) show = true;
        if (status === 'removed' && showRemoved) show = true;
        if (status === 'added' && showAdded) show = true;
        if (status === 'same' && showSame) show = true;
        card.style.display = show ? '' : 'none';
    });
}

function renderMissingNodesView() {
    if (!resultData) return;
    const container = document.getElementById('missingView');
    const eccNodes = resultData.eccNodes || [];
    const s4Nodes = resultData.s4Nodes || [];

    const eccPaths = new Set(eccNodes.map(n => n.path));
    const s4Paths = new Set(s4Nodes.map(n => n.path));

    // Nodes only in ECC (removed in S4)
    const onlyInEcc = eccNodes.filter(n => !s4Paths.has(n.path));
    // Nodes only in S4 (added in S4)
    const onlyInS4 = s4Nodes.filter(n => !eccPaths.has(n.path));

    if (onlyInEcc.length === 0 && onlyInS4.length === 0) {
        container.innerHTML = '<div class="no-diffs"><h2>&#x2705; No Missing Nodes</h2><p>Both forms have the same node structure.</p></div>';
        return;
    }

    let html = `<div class="summary-section">
        <h3 class="summary-title">&#x1F50D; Missing Nodes Summary</h3>
        <div class="cond-stats">
            <span class="cond-stat removed">${onlyInEcc.length} Only in ECC (missing in S4)</span>
            <span class="cond-stat added">${onlyInS4.length} Only in S4 (missing in ECC)</span>
        </div>`;

    // Only in ECC section
    if (onlyInEcc.length > 0) {
        html += `<div class="missing-section">
            <h4 class="missing-heading removed-heading">&#x274C; Nodes in ECC but MISSING in S4 (${onlyInEcc.length})</h4>`;
        
        // Group by page
        const grouped = {};
        onlyInEcc.forEach(n => {
            const pageMatch = n.path.match(/Page:\w+/);
            const page = pageMatch ? pageMatch[0] : 'Unknown';
            if (!grouped[page]) grouped[page] = [];
            grouped[page].push(n);
        });

        Object.keys(grouped).sort().forEach(page => {
            html += `<div class="missing-group">
                <div class="missing-group-title">${escapeHtml(page)}</div>`;
            grouped[page].forEach(n => {
                const shortPath = n.path.replace('Form > ', '').replace(/Page:\w+\s*>\s*/, '');
                const icon = getNodeIcon(n.type);
                html += `<div class="missing-node removed">
                    <span class="node-icon">${icon}</span>
                    <span class="node-type-badge">${n.type}</span>
                    <span class="node-label">${escapeHtml(n.label)}</span>
                    <span class="node-path-detail">${escapeHtml(shortPath)}</span>
                </div>`;
            });
            html += `</div>`;
        });
        html += `</div>`;
    }

    // Only in S4 section
    if (onlyInS4.length > 0) {
        html += `<div class="missing-section">
            <h4 class="missing-heading added-heading">&#x2705; Nodes in S4 but MISSING in ECC (${onlyInS4.length})</h4>`;
        
        const grouped = {};
        onlyInS4.forEach(n => {
            const pageMatch = n.path.match(/Page:\w+/);
            const page = pageMatch ? pageMatch[0] : 'Unknown';
            if (!grouped[page]) grouped[page] = [];
            grouped[page].push(n);
        });

        Object.keys(grouped).sort().forEach(page => {
            html += `<div class="missing-group">
                <div class="missing-group-title">${escapeHtml(page)}</div>`;
            grouped[page].forEach(n => {
                const shortPath = n.path.replace('Form > ', '').replace(/Page:\w+\s*>\s*/, '');
                const icon = getNodeIcon(n.type);
                html += `<div class="missing-node added">
                    <span class="node-icon">${icon}</span>
                    <span class="node-type-badge">${n.type}</span>
                    <span class="node-label">${escapeHtml(n.label)}</span>
                    <span class="node-path-detail">${escapeHtml(shortPath)}</span>
                </div>`;
            });
            html += `</div>`;
        });
        html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}

function getNodeIcon(type) {
    const icons = {
        'PAGE': '&#x1F4C4;',
        'WINDOW': '&#x1F5BC;',
        'TEXT': '&#x1F4DD;',
        'CODE': '&#x1F4BB;',
        'TEMPLATE': '&#x1F4CA;',
        'TABLE': '&#x1F4CB;',
        'LOOP': '&#x1F504;',
        'GRAPHIC': '&#x1F5BC;',
        'CONDITION': '&#x2753;',
        'ADDRESS': '&#x1F4E8;',
        'ALTERNATIVE': '&#x1F500;',
        'FOLDER': '&#x1F4C1;'
    };
    return icons[type] || '&#x25CF;';
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
    const sizeView = document.getElementById('sizeView');
    const conditionsView = document.getElementById('conditionsView');
    const missingView = document.getElementById('missingView');

    // Hide all
    diffSection.hidden = true;
    filterBar.hidden = true;
    searchBar.hidden = true;
    layoutView.hidden = true;
    sizeView.hidden = true;
    conditionsView.hidden = true;
    missingView.hidden = true;

    if (view === 'diff') {
        diffSection.hidden = false;
        filterBar.hidden = false;
        searchBar.hidden = false;
    } else if (view === 'size') {
        sizeView.hidden = false;
        renderSizeView();
    } else if (view === 'conditions') {
        conditionsView.hidden = false;
        renderConditionsView();
    } else if (view === 'missing') {
        missingView.hidden = false;
        renderMissingNodesView();
    } else {
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

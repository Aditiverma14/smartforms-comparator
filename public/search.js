// State
let loadedForms = []; // Array of { fileName, formName, data }

// DOM
const multiDropZone = document.getElementById('multiDropZone');
const multiFileInput = document.getElementById('multiFileInput');
const loadedFilesDiv = document.getElementById('loadedFiles');
const searchSection = document.getElementById('searchSection');
const resultsSection = document.getElementById('resultsSection');

// Init
function init() {
    // Drag & drop
    multiDropZone.addEventListener('click', () => multiFileInput.click());
    multiDropZone.addEventListener('dragover', (e) => { e.preventDefault(); multiDropZone.classList.add('dragover'); });
    multiDropZone.addEventListener('dragleave', () => multiDropZone.classList.remove('dragover'));
    multiDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        multiDropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    multiFileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // Search on enter
    document.getElementById('searchTermInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });

    // Theme
    initTheme();
}

async function handleFiles(files) {
    for (const file of files) {
        if (!file.name.endsWith('.xml')) continue;

        // Upload to server for parsing
        const formData = new FormData();
        formData.append('xmlFile', file);

        try {
            const response = await fetch('/api/parse-form', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Parse failed');
            const data = await response.json();
            
            // Avoid duplicates
            const exists = loadedForms.find(f => f.fileName === file.name);
            if (!exists) {
                loadedForms.push({
                    fileName: file.name,
                    formName: data.formName,
                    data: data
                });
            }
        } catch (err) {
            console.error('Error parsing', file.name, err);
        }
    }

    updateFileList();
}

function updateFileList() {
    if (loadedForms.length === 0) {
        loadedFilesDiv.hidden = true;
        searchSection.hidden = true;
        return;
    }

    loadedFilesDiv.hidden = false;
    searchSection.hidden = false;
    document.getElementById('fileCount').textContent = loadedForms.length;

    const chipsHtml = loadedForms.map((f, idx) => `
        <div class="file-chip">
            <span class="form-name">${escapeHtml(f.formName)}</span>
            <span>${escapeHtml(f.fileName)}</span>
            <button class="remove-chip" onclick="removeFile(${idx})">&times;</button>
        </div>
    `).join('');

    document.getElementById('fileChips').innerHTML = chipsHtml;
}

function removeFile(idx) {
    loadedForms.splice(idx, 1);
    updateFileList();
}

function clearAllFiles() {
    loadedForms = [];
    updateFileList();
    resultsSection.hidden = true;
    multiFileInput.value = '';
}

function doSearch() {
    const term = document.getElementById('searchTermInput').value.trim();
    if (!term) return;
    if (loadedForms.length === 0) return;

    const caseSensitive = document.getElementById('caseSensitive').checked;
    const wholeWord = document.getElementById('wholeWord').checked;

    const results = [];

    loadedForms.forEach(form => {
        const matches = searchInForm(form.data, term, caseSensitive, wholeWord);
        if (matches.length > 0) {
            results.push({
                formName: form.formName,
                fileName: form.fileName,
                matches: matches,
                totalCount: matches.reduce((sum, m) => sum + m.hits.length, 0)
            });
        }
    });

    renderResults(results, term);
}

function searchInForm(data, term, caseSensitive, wholeWord) {
    const locations = [];

    // Build regex
    let pattern = escapeRegex(term);
    if (wholeWord) pattern = `\\b${pattern}\\b`;
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(pattern, flags);

    // Search Interface
    const ifaceHits = [];
    (data.interfaceParams || []).forEach(p => {
        const line = `${p.NAME || ''} ${p.TYPENAME || ''} ${p.IOTYPE || ''}`;
        if (regex.test(line)) {
            ifaceHits.push({ text: `${p.NAME} (Type: ${p.TYPENAME || '?'}, IO: ${p.IOTYPE || '?'})`, lineNum: null });
        }
        regex.lastIndex = 0;
    });
    if (ifaceHits.length > 0) locations.push({ section: 'Interface', icon: '📋', hits: ifaceHits, fullCode: null });

    // Search Global Data
    const gdataHits = [];
    (data.globalData || []).forEach(d => {
        const line = `${d.NAME || ''} ${d.TYPENAME || ''} ${d.TYPING || ''}`;
        if (regex.test(line)) {
            gdataHits.push({ text: `${d.NAME} (${d.TYPING || 'TYPE'} ${d.TYPENAME || '?'})`, lineNum: null });
        }
        regex.lastIndex = 0;
    });
    if (gdataHits.length > 0) locations.push({ section: 'Global Data', icon: '📦', hits: gdataHits, fullCode: null });

    // Search Global Types
    const gtypeHits = [];
    (data.globalTypes || []).forEach((line, idx) => {
        if (regex.test(line)) {
            gtypeHits.push({ text: line, lineNum: idx + 1 });
        }
        regex.lastIndex = 0;
    });
    if (gtypeHits.length > 0) locations.push({ section: 'Global Types', icon: '🔤', hits: gtypeHits, fullCode: (data.globalTypes || []).join('\n') });

    // Search Global Code
    const gcodeHits = [];
    (data.globalCode || []).forEach((line, idx) => {
        if (regex.test(line)) {
            gcodeHits.push({ text: line, lineNum: idx + 1 });
        }
        regex.lastIndex = 0;
    });
    if (gcodeHits.length > 0) locations.push({ section: 'Global Code (Initialization)', icon: '💻', hits: gcodeHits, fullCode: (data.globalCode || []).join('\n') });

    // Search Properties (node-level code, text content, conditions)
    const codeHits = {};
    const codeFull = {};
    const textHits = {};
    const condHits = {};

    Object.keys(data.properties || {}).forEach(path => {
        const value = data.properties[path];
        if (!regex.test(value)) { regex.lastIndex = 0; return; }
        regex.lastIndex = 0;

        if (path.includes('Program Lines') || path.includes('Code:')) {
            const location = path.replace(' > Program Lines', '').replace('Form > ', '');
            if (!codeHits[location]) codeHits[location] = [];
            if (!codeFull[location]) codeFull[location] = value;
            // Split into lines and find matching ones
            const lines = value.split('\n');
            lines.forEach((line, idx) => {
                if (regex.test(line)) {
                    codeHits[location].push({ text: line, lineNum: idx + 1 });
                }
                regex.lastIndex = 0;
            });
        } else if (path.includes('Content') || path.includes('Text:')) {
            const location = path.replace(' > Content', '').replace('Form > ', '');
            if (!textHits[location]) textHits[location] = [];
            textHits[location].push({ text: value.substring(0, 200), lineNum: null });
        } else if (path.includes('Condition:')) {
            const location = path.replace('Form > ', '');
            if (!condHits[location]) condHits[location] = [];
            condHits[location].push({ text: value, lineNum: null });
        }
    });

    // Add code hits
    Object.keys(codeHits).forEach(loc => {
        locations.push({ section: `Code: ${loc}`, icon: '💻', hits: codeHits[loc], fullCode: codeFull[loc] || null });
    });

    // Add text hits
    Object.keys(textHits).forEach(loc => {
        locations.push({ section: `Text: ${loc}`, icon: '📝', hits: textHits[loc], fullCode: null });
    });

    // Add condition hits
    Object.keys(condHits).forEach(loc => {
        locations.push({ section: `Condition: ${loc}`, icon: '❓', hits: condHits[loc], fullCode: null });
    });

    return locations;
}

function renderResults(results, term) {
    resultsSection.hidden = false;

    if (results.length === 0) {
        resultsSection.innerHTML = `
            <div class="no-results">
                <h3>No matches found</h3>
                <p>"${escapeHtml(term)}" was not found in any of the ${loadedForms.length} uploaded SmartForms.</p>
            </div>`;
        return;
    }

    const totalMatches = results.reduce((sum, r) => sum + r.totalCount, 0);

    let html = `
        <div class="results-header">
            <h3>Found "${escapeHtml(term)}" in ${results.length} of ${loadedForms.length} SmartForms (${totalMatches} matches)</h3>
        </div>`;

    results.forEach(result => {
        const formId = `result-${results.indexOf(result)}`;
        html += `
            <div class="result-form">
                <div class="result-form-header" onclick="toggleFormResult('${formId}')">
                    <span class="result-form-chevron" id="chevron-${formId}">&#x25B6;</span>
                    <span class="result-form-name">${escapeHtml(result.formName)}</span>
                    <span class="result-form-count">${result.totalCount} matches</span>
                    <span class="result-form-file">${escapeHtml(result.fileName)}</span>
                </div>
                <div class="result-form-body" id="${formId}" style="display:none;">`;

        result.matches.forEach((location, locIdx) => {
            const codeBlockId = `code-${formId}-${locIdx}`;
            const hasFullCode = location.fullCode && location.fullCode.length > 0;

            html += `
                <div class="result-location">
                    <div class="result-location-title">
                        ${location.icon} ${escapeHtml(location.section)}
                        ${hasFullCode ? `<button class="view-code-btn" onclick="toggleFullCode('${codeBlockId}')">View Full Code &#x25BC;</button>` : ''}
                    </div>`;

            location.hits.forEach((hit, hitIdx) => {
                const highlighted = highlightTerm(escapeHtml(hit.text), term);
                const lineLabel = hit.lineNum ? `<span class="line-num">Line ${hit.lineNum}:</span>` : '';
                const clickAttr = (hasFullCode && hit.lineNum) ? `onclick="jumpToLine('${codeBlockId}', ${hit.lineNum})" class="result-match clickable-match"` : `class="result-match"`;
                html += `<div ${clickAttr}>${lineLabel}${highlighted}</div>`;
            });

            // Full code block (hidden by default)
            if (hasFullCode) {
                const lines = location.fullCode.split('\n');
                const matchedLineNums = new Set(location.hits.filter(h => h.lineNum).map(h => h.lineNum));
                let codeHtml = '';
                lines.forEach((line, idx) => {
                    const lineNum = idx + 1;
                    const isMatch = matchedLineNums.has(lineNum);
                    const highlightedLine = isMatch ? highlightTerm(escapeHtml(line), term) : escapeHtml(line);
                    const lineClass = isMatch ? 'full-code-line highlighted-line' : 'full-code-line';
                    codeHtml += `<div class="${lineClass}" id="${codeBlockId}-line-${lineNum}"><span class="line-num-full">${lineNum}</span>${highlightedLine}</div>`;
                });
                html += `<div class="full-code-block" id="${codeBlockId}" style="display:none;"><pre>${codeHtml}</pre></div>`;
            }

            html += `</div>`;
        });

        html += `</div></div>`;
    });

    html += `<div style="margin-top:15px;"><button class="expand-all-btn" onclick="toggleAllResults()">Expand / Collapse All</button></div>`;

    resultsSection.innerHTML = html;
}

function toggleFormResult(id) {
    const body = document.getElementById(id);
    const chevron = document.getElementById('chevron-' + id);
    if (body.style.display === 'none') {
        body.style.display = 'block';
        chevron.innerHTML = '&#x25BC;';
    } else {
        body.style.display = 'none';
        chevron.innerHTML = '&#x25B6;';
    }
}

function toggleAllResults() {
    const bodies = document.querySelectorAll('.result-form-body');
    const anyHidden = Array.from(bodies).some(b => b.style.display === 'none');
    bodies.forEach(b => {
        b.style.display = anyHidden ? 'block' : 'none';
    });
    document.querySelectorAll('.result-form-chevron').forEach(c => {
        c.innerHTML = anyHidden ? '&#x25BC;' : '&#x25B6;';
    });
}

function toggleFullCode(id) {
    const block = document.getElementById(id);
    if (block.style.display === 'none') {
        block.style.display = 'block';
        // Scroll the first highlighted line into view
        const highlighted = block.querySelector('.highlighted-line');
        if (highlighted) {
            setTimeout(() => highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
    } else {
        block.style.display = 'none';
    }
}

function jumpToLine(codeBlockId, lineNum) {
    const block = document.getElementById(codeBlockId);
    // Expand the code block if hidden
    if (block.style.display === 'none') {
        block.style.display = 'block';
    }

    // Remove previous active highlight
    block.querySelectorAll('.active-line').forEach(el => el.classList.remove('active-line'));

    // Find the target line and scroll to it
    const targetLine = document.getElementById(`${codeBlockId}-line-${lineNum}`);
    if (targetLine) {
        targetLine.classList.add('active-line');
        setTimeout(() => targetLine.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
}

function highlightTerm(text, term) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function initTheme() {
    const saved = localStorage.getItem('sf-theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');

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

init();

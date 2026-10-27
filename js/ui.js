// js/ui.js — ЗАМЕНА ТЕКСТА НА "Ошибки не выявлены"

import { state, ITEMS_PER_PAGE } from './state.js';
import { applyFilters, matchesTab } from './data.js';
import { formatDate, updateLabel, escapeHtml, destroyChart, getVal, getValidationUrl } from './utils.js';
import { renderFeedbackTable, renderFeedbackTableHome, applyFeedbackFilters } from './feedback.js';
import {
    applySupersetFilters, formatPeriod, getNormForDate, getNormsForPeriod,
    addNormEntry, getTable1Config, getTable2Config, getTable3Config, getTable4Config
} from './superset.js';

const CHART_COLORS = ['#f9d7d7', '#fce4c8', '#e1d9f9', '#d3e9fb', '#d4ebd9'];

export function switchMenu(menuId, btn) {
    state.currentMenu = menuId;
    document.querySelectorAll('.nav-icon').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById('section-' + menuId);
    if (sec) sec.classList.add('active');

    const topBar = document.getElementById('topBar');
    topBar.style.display = (menuId === 'data') ? 'none' : 'flex';

    if (menuId === 'main') triggerFilterUpdate();
    if (menuId === 'errors') renderErrorsTable();
    if (menuId === 'feedback') {
        renderFeedbackTable();
        state.pagination.fbTable = 1;
    }
    if (menuId === 'superset') {
        applySupersetFilters();
        renderSupersetPage();
    }
}

export function switchTab(tabId, btn) {
    state.currentTab = tabId;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');

    state.pagination.mainData = 1;
    state.pagination.fbHome = 1;
    state.pagination.fbTable = 1;
    state.pagination.superset1 = 1;
    state.pagination.superset2 = 1;
    state.pagination.superset3 = 1;
    state.pagination.superset4 = 1;

    if (state.currentMenu === 'main') triggerFilterUpdate();
    if (state.currentMenu === 'errors') renderErrorsTable();
    if (state.currentMenu === 'feedback') renderFeedbackTable();
    if (state.currentMenu === 'superset') {
        applySupersetFilters();
        renderSupersetPage();
    }
}

export function buildProjectTabs() {
    const tabsContainer = document.getElementById('projectTabs');
    if (!tabsContainer) return;

    const projectSet = new Set();
    for (const r of state.processedData) {
        if (!r.project) continue;
        const name = String(r.project).replace(/_validate$/, '').trim();
        if (name) projectSet.add(name);
    }

    const supersetProjects = new Set();
    for (const arr of [state.rawSuperset1, state.rawSuperset2, state.rawSuperset3]) {
        for (const r of arr) {
            const proj = getVal(r, 'Проект');
            if (proj) supersetProjects.add(String(proj).trim());
        }
    }
    for (const sp of supersetProjects) {
        if (!sp.endsWith('_validate')) continue;
        const parent = sp.substring(0, sp.length - '_validate'.length).trim();
        if (projectSet.has(parent)) projectSet.add(sp);
    }

    const projects = Array.from(projectSet).sort();
    state.projects = projects;

    if (projects.length <= 1) {
        tabsContainer.style.display = 'none';
        tabsContainer.innerHTML = '';
        state.currentTab = 'all';
        return;
    }

    tabsContainer.style.display = 'flex';
    if (state.currentTab !== 'all' && !projects.includes(state.currentTab)) state.currentTab = 'all';

    let html = '<div class="tab ' + (state.currentTab === 'all' ? 'active' : '') + '" data-tab="all">Все</div>';
    for (const p of projects) {
        const safe = escapeHtml(p);
        const active = state.currentTab === p ? 'active' : '';
        html += '<div class="tab ' + active + '" data-tab="' + safe + '">' + safe + '</div>';
    }
    tabsContainer.innerHTML = html;
}

export function renderMarkersTasksStatus() {
    const container = document.getElementById('markersStatusList');
    if (!container) return;
    if (!state.rawMarkers || state.rawMarkers.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const valKeys = new Set();
    for (const v of state.rawValidation) {
        const taskId = getVal(v, 'task_id');
        const markerId = getVal(v, 'marker_id');
        if (taskId != null && markerId != null) {
            valKeys.add(String(taskId).trim() + '|' + String(markerId).trim());
        }
    }

    const tasksMap = new Map();
    for (const m of state.rawMarkers) {
        const taskName = getVal(m, 'Задача');
        if (!taskName) continue;
        const taskId = getVal(m, 'ID задачи');
        const markerId = getVal(m, 'ID разметчика');
        const key = (taskId != null && markerId != null)
            ? String(taskId).trim() + '|' + String(markerId).trim()
            : null;
        if (!tasksMap.has(taskName)) tasksMap.set(taskName, { pairs: new Set(), matched: new Set() });
        const entry = tasksMap.get(taskName);
        if (key) {
            entry.pairs.add(key);
            if (valKeys.has(key)) entry.matched.add(key);
        }
    }

    const tasks = [];
    for (const [name, entry] of tasksMap) {
        tasks.push({
            name,
            hasVal: entry.matched.size > 0,
            totalPairs: entry.pairs.size,
            matchedPairs: entry.matched.size
        });
    }

    tasks.sort((a, b) => {
        if (a.hasVal === b.hasVal) return a.name.localeCompare(b.name);
        return a.hasVal ? 1 : -1;
    });

    const withVal = tasks.filter(t => t.hasVal).length;
    const withoutVal = tasks.length - withVal;

    let html = '<div class="markers-status-summary">'
        + '<span style="color:var(--success)">✅ ' + withVal + '</span>'
        + '<span style="color:var(--danger)">❌ ' + withoutVal + '</span>'
        + '<span style="margin-left:auto; color:var(--muted)">Всего задач: ' + tasks.length + '</span>'
        + '</div><ul class="markers-status-items">';
    for (const t of tasks) {
        const icon = t.hasVal ? '✅' : '❌';
        const cls = t.hasVal ? 'ok' : 'bad';
        const pairsInfo = t.totalPairs > 0
            ? '<span class="markers-status-pairs">(' + t.matchedPairs + '/' + t.totalPairs + ')</span>'
            : '';
        html += '<li class="markers-status-item ' + cls + '" title="' + escapeHtml(t.name) + '">'
            + '<span class="markers-status-icon">' + icon + '</span>'
            + '<span class="markers-status-name">' + escapeHtml(t.name) + '</span>'
            + pairsInfo + '</li>';
    }
    html += '</ul>';

    container.innerHTML = html;
    container.style.display = 'block';
}

export function toggleDropdown(id) {
    const dropdown = document.getElementById(id + '_dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open'));
    if (!isOpen) {
        dropdown.classList.add('open');
        const searchInput = dropdown.querySelector('.ms-search');
        if (searchInput) {
            searchInput.value = '';
            filterMsOptions(searchInput);
            setTimeout(() => searchInput.focus(), 50);
        }
    }
}

export function filterMsOptions(inputEl) {
    const dropdown = inputEl.closest('.ms-dropdown');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.ms-item');
    const query = inputEl.value.toLowerCase();
    for (const item of items) {
        if (item.classList.contains('ms-all')) continue;
        item.style.display = item.textContent.toLowerCase().includes(query) ? 'flex' : 'none';
    }
}

export function toggleAll(containerId, stateKey) {
    const allCheckbox = document.getElementById(containerId + '_all');
    const checkboxes = document.querySelectorAll('#' + containerId + '_options input[type="checkbox"]');
    state.filterState[stateKey].clear();
    for (const cb of checkboxes) {
        cb.checked = allCheckbox.checked;
        if (cb.checked) state.filterState[stateKey].add(cb.value);
    }
    updateLabel(containerId, stateKey);
    
    if (stateKey === 'feedbackPool') {
        applyFeedbackFilters();
    } else {
        const excl = ['fbFormPools', 'feedbackGroup', 'fbRecordMarkers'];
        if (!excl.includes(stateKey)) triggerFilterUpdate();
    }
}

export function onOptionChange(containerId, stateKey, value, isChecked) {
    if (isChecked) state.filterState[stateKey].add(value);
    else state.filterState[stateKey].delete(value);
    const allCheckbox = document.getElementById(containerId + '_all');
    const checkboxes = document.querySelectorAll('#' + containerId + '_options input[type="checkbox"]');
    allCheckbox.checked = Array.from(checkboxes).every(cb => cb.checked);
    updateLabel(containerId, stateKey);

    if (stateKey === 'feedbackPool') {
        applyFeedbackFilters();
    } else {
        const excl = ['fbFormPools', 'feedbackGroup', 'fbRecordMarkers'];
        if (!excl.includes(stateKey)) triggerFilterUpdate();
    }
}

export function populateMultiSelect(containerId, stateKey, values) {
    const optionsContainer = document.getElementById(containerId + '_options');
    if (!optionsContainer) return;
    state.filterState[stateKey].clear();
    document.getElementById(containerId + '_all').checked = false;
    optionsContainer.innerHTML = values.map(val => {
        const safe = escapeHtml(val);
        return `<label class="ms-item"><input type="checkbox" value="${safe}" onchange="onOptionChange('${containerId}', '${stateKey}', this.value, this.checked)"><span style="word-break: break-word;" title="${safe}">${safe}</span></label>`;
    }).join('');
    updateLabel(containerId, stateKey);
}

export function populateAllMultiSelects() {
    const pools = [...new Set(state.processedData.map(r => r.pool).filter(Boolean))].sort();
    const markers = [...new Set(state.processedData.map(r => r.marker).filter(Boolean))].sort();
    populateMultiSelect('msPool', 'pool', pools);
    populateMultiSelect('msMarker', 'marker', markers);
    populateMultiSelect('msResult', 'result', ['Ошибка', 'Рекомендация', 'Ошибки не выявлены']); // ★ ИЗМЕНЕНО
    populateMultiSelect('msFbPool', 'feedbackPool', pools);
    populateMultiSelect('msFbFormPools', 'fbFormPools', pools);
    populateMultiSelect('msFbRecordMarkers', 'fbRecordMarkers', markers);
}

export function populateRecDatalists() {
    const projects = new Set();
    const pools = new Set();
    const markers = new Set();
    const validators = new Set();

    for (const r of state.processedData) {
        if (r.project) {
            const p = r.project.replace(/_validate$/, '').trim();
            if (p) projects.add(p);
        }
        if (r.pool) pools.add(r.pool);
        if (r.marker) markers.add(r.marker);
        if (r.validator) validators.add(r.validator);
    }

    const fill = (id, set) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = Array.from(set).sort().map(v => `<option value="${escapeHtml(v)}">`).join('');
    };

    fill('recProjectsList', projects);
    fill('recPoolsList', pools);
    fill('recMarkersList', markers);
    fill('recValidatorsList', validators);
}

export function addRecRow() {
    const tbody = document.getElementById('recTableBody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="date" class="rec-date" style="padding:8px; width:100%; border:1px solid #ddd; border-radius:6px;"></td>
        <td><input type="text" class="rec-project" list="recProjectsList" placeholder="Проект" style="padding:8px; width:100%; border:1px solid #ddd; border-radius:6px;"></td>
        <td><input type="text" class="rec-pool" list="recPoolsList" placeholder="Пул" style="padding:8px; width:100%; border:1px solid #ddd; border-radius:6px;"></td>
        <td><input type="text" class="rec-marker" list="recMarkersList" placeholder="Почта" style="padding:8px; width:100%; border:1px solid #ddd; border-radius:6px;"></td>
        <td><input type="text" class="rec-item" placeholder="item_id" style="padding:8px; width:100%; border:1px solid #ddd; border-radius:6px;"></td>
        <td><input type="text" class="rec-interval" placeholder="0:00-1:00" style="padding:8px; width:100%; border:1px solid #ddd; border-radius:6px;"></td>
        <td><textarea class="rec-comment" placeholder="Текст комментария" rows="3"></textarea></td>
        <td><input type="text" class="rec-validator" list="recValidatorsList" placeholder="Почта" style="padding:8px; width:100%; border:1px solid #ddd; border-radius:6px;"></td>
        <td style="text-align:center; vertical-align:middle;"><button class="icon-btn danger" onclick="this.closest('tr').remove()" title="Удалить"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></td>
    `;
    tbody.appendChild(tr);
}

// ... (остальные функции: buildTable и т.д. — заменяем 'Ошибок не выявлено' на 'Ошибки не выявлены' при необходимости)
export function buildTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const groups = new Map();
    const groupByKey = new Map();

    for (const r of state.filteredData) {
        if (r._type !== 'validation') continue;
        const key = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
        let group = groupByKey.get(key);
        if (!group) {
            group = { _id: r._id, date: r.date, project: r.project, pool: r.pool, marker: r.marker, fileName: r.fileName, quality: r.quality, fragments: r.fragments, url: r.url, orgId: r.orgId, assignmentId: r.assignmentId, itemId: r.itemId, _type: r._type, _linked: r._linked, items: [] };
            groupByKey.set(key, group);
            groups.set(r._id, group);
        }
        group.items.push({ result: r.result, errorType: r.errorType, comment: r.comment, interval: r.interval });
    }

    for (const r of state.filteredData) {
        if (r._type !== 'recommendations') continue;
        let group = null;
        if (r._linked) group = groups.get(r._linked);
        if (!group) {
            const key = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
            group = groupByKey.get(key);
        }
        if (!group) {
            group = { _id: r._id, date: r.date, project: r.project, pool: r.pool, marker: r.marker, fileName: r.fileName, quality: r.quality, fragments: r.fragments, url: r.url, orgId: r.orgId, assignmentId: r.assignmentId, itemId: r.itemId, _type: r._type, _linked: r._linked, items: [] };
            const key = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
            groupByKey.set(key, group);
            groups.set(r._id, group);
        }
        group.items.push({ result: r.result, errorType: r.errorType, comment: r.comment, interval: r.interval });
    }

    const groupedArray = Array.from(groups.values());
    groupedArray.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date - a.date;
    });

    const totalItems = groupedArray.length;
    const currentPage = state.pagination.mainData;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const rows = groupedArray.slice(startIndex, endIndex);

    tbody.innerHTML = rows.map(g => {
        let valLink = '—';
        let hasLink = false;
        let linkUrl = '';

        if (g.url) { linkUrl = g.url; hasLink = true; }
        else if (g._type === 'validation' && g.orgId && g.assignmentId && g.itemId) {
            linkUrl = getValidationUrl(g.orgId, g.assignmentId, g.itemId);
            if (linkUrl) hasLink = true;
        }
        if (hasLink) valLink = `<a href="${linkUrl}" target="_blank" class="badge-link">Перейти</a>`;

        const fileName = g.fileName ? escapeHtml(g.fileName.slice(0, 40)) : '';
        const fileNameTitle = escapeHtml(g.fileName || '');
        
        const link = g._type === 'recommendations'
            ? (g._linked ? '<span class="badge badge-linked">связано</span>' : '<span class="badge" style="background:#fde8e8;color:#e55555">нет пары</span>')
            : '—';

        const quality = (g.quality !== null && !isNaN(g.quality)) ? (g.quality * 100).toFixed(1) + '%' : '';

        let itemsHtml = '<div class="items-grid">';
        for (const item of g.items) {
            const badgeClass = item.result === 'Ошибка' ? 'badge-error' : item.result === 'Рекомендация' ? 'badge-rec' : 'badge-ok';
            const resBadge = `<span class="badge ${badgeClass}">${escapeHtml(item.result || '')}</span>`;
            const errType = escapeHtml(item.errorType || '');
            const comment = item.comment ? escapeHtml(item.comment.slice(0, 100)) : '';
            const commentTitle = item.comment ? escapeHtml(item.comment) : '';
            const interval = escapeHtml(item.interval || '');

            itemsHtml += `
                <div class="item-row">
                    <div>${resBadge}</div>
                    <div>${errType}</div>
                    <div ${commentTitle ? `title="${commentTitle}"` : ''}>${comment}</div>
                    <div>${interval}</div>
                </div>
            `;
        }
        itemsHtml += '</div>';

        return `<tr>
            <td>${g.date ? formatDate(g.date) : ''}</td>
            <td>${escapeHtml(g.project || '')}</td>
            <td>${escapeHtml(g.pool || '')}</td>
            <td>${escapeHtml(g.marker || '')}</td>
            <td title="${fileNameTitle}">${fileName}</td>
            <td colspan="4" style="padding: 0;">${itemsHtml}</td>
            <td>${quality}</td>
            <td>${valLink}</td>
            <td>${link}</td>
        </tr>`;
    }).join('');

    renderPaginationControls('pagination-data-controls', 'pagination-data-info', totalItems, 'mainData');
}
// ... (остальные функции не менялись)

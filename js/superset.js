// js/superset.js — ЧИСТКА КОДА
// Удалено: calcFactQuality (не используется)
// Остальное без изменений (с fallback для globalAvg и фильтрами качества)

import { state, saveToStorage } from './state.js';
import { getVal, parseExcelDate, parseHtmlNumber, parseNorm, formatDate } from './utils.js';

// ===== Утилиты =====
function normalizeProject(project) {
    return (project || '').trim();
}

// ===== Кэш проектов главной страницы =====
function computeMainProjectsSet() {
    const set = new Set();

    for (const r of state.processedData) {
        if (!r.project) continue;
        const name = String(r.project).trim();
        if (name) set.add(name);
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
        if (set.has(parent)) {
            set.add(sp);
        }
    }
    return set;
}

function getMainProjects() {
    if (!state.superset._mainProjects) {
        state.superset._mainProjects = computeMainProjectsSet();
    }
    return state.superset._mainProjects;
}

// ===== Экспорт — только проекты с главной страницы =====
export function getFilteredSupersetRaw() {
    const mainSet = getMainProjects();
    const filterFn = (r) => {
        const proj = (getVal(r, 'Проект') || '').trim();
        return mainSet.has(proj);
    };
    return {
        s1: state.rawSuperset1.filter(filterFn),
        s2: state.rawSuperset2.filter(filterFn),
        s3: state.rawSuperset3.filter(filterFn)
    };
}

// ===== Остальные утилиты =====
function avg(arr) {
    if (!arr || arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function parseHtmlNumberToFloat(val) {
    if (val == null) return null;
    const s = parseHtmlNumber(val);
    if (!s) return null;
    const n = parseFloat(String(s).replace(',', '.'));
    return isNaN(n) ? null : n;
}

function parsePriceToFloat(val) {
    if (val == null || val === '') return null;
    const s = String(val).replace(/\s+/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

export function formatISODate(date) {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

export function formatPeriod(start, end) {
    const s = start ? formatDate(start) : null;
    const e = end ? formatDate(end) : null;
    if (s && e) return s + '-' + e;
    if (s) return 'с ' + s;
    if (e) return 'по ' + e;
    return '';
}

// ===== История норм у.е. в час =====
export function getNormForDate(dateISO) {
    const fallbackDate = new Date().toISOString().slice(0, 10);
    const d = dateISO || fallbackDate;
    const history = state.superset.normHistory.slice().sort((a, b) => a.date.localeCompare(b.date));
    let value = 580;
    for (const entry of history) {
        if (entry.date <= d) value = entry.value;
        else break;
    }
    return value;
}

export function getNormsForPeriod(dateFrom, dateTo) {
    const history = state.superset.normHistory.slice().sort((a, b) => a.date.localeCompare(b.date));
    if (history.length === 0) return [{ value: 580, label: null }];

    if (!dateFrom && !dateTo) {
        const current = getNormForDate(new Date().toISOString().slice(0, 10));
        return [{ value: current, label: null }];
    }

    const from = dateFrom || '1900-01-01';
    const to = dateTo || '9999-12-31';

    const segments = [];
    for (let i = 0; i < history.length; i++) {
        const segStart = history[i].date;
        const segEndNext = i + 1 < history.length ? history[i + 1].date : null;
        if (segEndNext && segEndNext <= from) continue;
        if (segStart > to) break;
        const effectiveStart = segStart > from ? segStart : from;
        const effectiveEnd = segEndNext && segEndNext <= to ? segEndNext : to;
        segments.push({ value: history[i].value, start: effectiveStart, end: effectiveEnd });
    }

    if (segments.length === 0) {
        return [{ value: getNormForDate(from), label: null }];
    }
    if (segments.length === 1) {
        return [{ value: segments[0].value, label: null }];
    }

    const mapped = segments.map((s, idx) => {
        let label = null;
        if (idx < segments.length - 1) {
            const endDate = new Date(s.end + 'T00:00:00');
            endDate.setDate(endDate.getDate() - 1);
            label = 'до ' + formatDate(endDate);
        } else {
            label = 'с ' + formatDate(new Date(s.start + 'T00:00:00'));
        }
        return { value: s.value, label };
    });

    return mapped.reverse();
}

export function addNormEntry(dateISO, value) {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return false;
    state.superset.normHistory = state.superset.normHistory.filter(e => e.date !== dateISO);
    state.superset.normHistory.push({ date: dateISO, value: num });
    state.superset.normHistory.sort((a, b) => a.date.localeCompare(b.date));
    saveToStorage();
    return true;
}

// ===== Нормативы качества =====
function buildNorms() {
    const byProjectPool = {};
    const byProjectSets = {};
    const mainSet = getMainProjects();

    const useMainSet = mainSet.size > 0;
    const shouldInclude = (project) => {
        if (!useMainSet) return true;
        return mainSet.has(project);
    };

    for (const r of state.rawSuperset2) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (!shouldInclude(project)) continue;
        if (project.endsWith('_validate')) continue;

        const task = getVal(r, 'Задача');
        const norm = parseNorm(getVal(r, 'Норма качества'));
        if (norm === null) continue;
        if (task) byProjectPool[project + '|' + task] = norm;
        if (!byProjectSets[project]) byProjectSets[project] = new Set();
        byProjectSets[project].add(norm);
    }
    for (const r of state.rawSuperset3) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (!shouldInclude(project)) continue;
        if (project.endsWith('_validate')) continue;

        const task = getVal(r, 'Задача');
        const norm = parseNorm(getVal(r, 'Норматив'));
        if (norm === null) continue;
        if (task && byProjectPool[project + '|' + task] == null) {
            byProjectPool[project + '|' + task] = norm;
        }
        if (!byProjectSets[project]) byProjectSets[project] = new Set();
        byProjectSets[project].add(norm);
    }

    const byProject = {};
    for (const p in byProjectSets) {
        const a = avg(Array.from(byProjectSets[p]));
        if (a !== null) byProject[p] = a;
    }

    const allUniqueNorms = [];
    for (const p in byProjectSets) {
        byProjectSets[p].forEach(n => allUniqueNorms.push(n));
    }
    const globalAvg = avg(allUniqueNorms);

    state.superset.norms = {
        byProjectPool,
        byProject,
        globalAvg
    };
}

// ===== Индекс ФИО ↔ Почта =====
function buildEmployeeMap() {
    const fioToEmail = {};
    const emailToFio = {};
    for (const r of state.rawEmployeeMap) {
        const fio = getVal(r, 'ФИО', 'Фио', 'ФИО разметчика');
        const email = getVal(r, 'Почта', 'Почта разметчика', 'Email', 'email');
        if (!fio || !email) continue;
        const fioStr = String(fio).trim();
        const emailStr = String(email).trim();
        if (!fioStr || !emailStr) continue;
        fioToEmail[fioStr] = emailStr;
        emailToFio[emailStr] = fioStr;
    }
    state.superset.employeeMap = { fioToEmail, emailToFio };
    return state.superset.employeeMap;
}

// ===== Индекс качества по email (с дедупликацией по файлам) =====
function computeEmployeeQualityIndex() {
    const byEmailOnly = {};
    const byEmailProject = {};
    const byEmailProjectTask = {};
    const { dateFrom, dateTo } = state.superset.filters;
    const seen = new Set();

    for (const r of state.processedData) {
        if (r.quality == null || !isFinite(r.quality)) continue;
        const em = (r.marker || '').trim().toLowerCase();
        if (!em) continue;

        if (dateFrom || dateTo) {
            if (!r.date) continue;
            const iso = formatISODate(r.date);
            if (dateFrom && iso < dateFrom) continue;
            if (dateTo && iso > dateTo) continue;
        }

        const proj = normalizeProject(r.project);
        if (state.currentTab !== 'all' && proj && proj !== state.currentTab) continue;

        const pool = r.pool || '';

        const key = em + '|' + proj + '|' + pool + '|' + (r.fileName || '');
        if (seen.has(key)) continue;
        seen.add(key);

        if (!byEmailOnly[em]) byEmailOnly[em] = [];
        byEmailOnly[em].push(r.quality);

        if (proj) {
            const projKey = em + '|' + proj;
            if (!byEmailProject[projKey]) byEmailProject[projKey] = [];
            byEmailProject[projKey].push(r.quality);

            if (pool) {
                const ptKey = em + '|' + proj + '|' + pool;
                if (!byEmailProjectTask[ptKey]) byEmailProjectTask[ptKey] = [];
                byEmailProjectTask[ptKey].push(r.quality);
            }
        }
    }

    return { byEmailOnly, byEmailProject, byEmailProjectTask };
}

// ===== Фильтры =====
function matchesProject(project) {
    const name = normalizeProject(project);
    if (!name) return false;
    const mainSet = getMainProjects();
    if (mainSet.size > 0 && !mainSet.has(name)) return false;
    if (state.currentTab === 'all') return true;
    return name === state.currentTab;
}

function matchesDateRangeRow(date) {
    const { dateFrom, dateTo } = state.superset.filters;
    if (!dateFrom && !dateTo) return true;
    if (!date) return false;
    const iso = formatISODate(date);
    if (dateFrom && iso < dateFrom) return false;
    if (dateTo && iso > dateTo) return false;
    return true;
}

function matchesPeriodRange(start, end) {
    const { dateFrom, dateTo } = state.superset.filters;
    if (!dateFrom && !dateTo) return true;
    const s = start ? formatISODate(start) : null;
    const e = end ? formatISODate(end) : null;
    if (!s && !e) return false;
    const rowStart = s || e;
    const rowEnd = e || s;
    if (dateFrom && rowEnd < dateFrom) return false;
    if (dateTo && rowStart > dateTo) return false;
    return true;
}

function matchesTask(task) {
    const tasks = state.superset.filters.tasks;
    if (tasks.size === 0) return true;
    return tasks.has(task || '');
}

function matchesColumnFilters(tableId, row, configs) {
    const filters = state.superset.tableFilters[tableId] || {};
    for (const cfg of configs) {
        const sel = filters[cfg.key];
        if (!sel || sel.size === 0) continue;
        const val = cfg.get(row) || '';
        if (!sel.has(val)) return false;
    }
    return true;
}

// ===== Конфиги столбцов =====
export function getTable1Config() {
    return [
        { key: 'task', label: 'Задача', get: r => r.task || '' },
        { key: 'fragments', label: 'Размечено, шт', get: r => String(r.fragments || '') },
        { key: 'normQuality', label: 'Норма качества', get: r => String(r.normQuality || '') },
        { key: 'quality', label: 'Качество', get: r => String(r.quality || '') },
        { key: 'comment', label: 'Комментарий', get: r => String(r.comment || '') },
        { key: 'withoutQuality', label: 'Без качества, шт', get: r => String(r.withoutQuality || '') },
        { key: 'ballsPerHour', label: 'Факт баллов/час', get: r => String(r.ballsPerHour || '') },
        { key: 'prodPerHour', label: 'Кпроизв в час', get: r => String(r.prodPerHour || '') },
        { key: 'price', label: 'Цена', get: r => String(r.price || '') },
        { key: 'taskType', label: 'Тип задания', get: r => String(r.taskType || '') },
        { key: 'period', label: 'Период разметки', get: r => formatPeriod(r.dateStart, r.dateEnd) }
    ];
}

export function getTable2Config() {
    return [
        { key: 'date', label: 'Дата', get: r => r.date ? formatDate(r.date) : '' },
        { key: 'fio', label: 'ФИО', get: r => r.fio || '' },
        { key: 'task', label: 'Задача', get: r => r.task || '' },
        { key: 'fragments', label: 'Размечено, шт', get: r => String(r.fragments || '') },
        { key: 'balls', label: 'Размечено, б', get: r => String(r.balls || '') },
        { key: 'qualitySuperset', label: 'Качество в суперсете', get: r => String(r.qualitySuperset || '') },
        { key: 'qualityFact', label: 'Качество факт.', get: r => r.qualityFact != null ? (r.qualityFact * 100).toFixed(1) + '%' : '' },
        { key: 'norm', label: 'Норматив', get: r => String(r.norm || '') },
        { key: 'withoutQuality', label: 'Без качества, шт', get: r => String(r.withoutQuality || '') }
    ];
}

export function getTable3Config() {
    return [
        { key: 'date', label: 'Дата', get: r => r.date ? formatDate(r.date) : '' },
        { key: 'price', label: 'Цена', get: r => String(r.price || '') }
    ];
}

export function getTable4Config() {
    return [
        { key: 'fio', label: 'ФИО', get: r => r.fio || '' },
        { key: 'factQuality', label: 'Качество', get: r => r.factQuality != null ? (r.factQuality * 100).toFixed(1) + '%' : '' },
        { key: 'normQuality', label: 'Норматив', get: r => r.normQuality != null ? r.normQuality.toFixed(1) + '%' : '' }
    ];
}

// ===== Построение таблиц =====
function buildTable1() {
    const mainSet = getMainProjects();
    const useMainSet = mainSet.size > 0;

    const idx1 = {};
    for (const r of state.rawSuperset1) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (useMainSet && !mainSet.has(project)) continue;
        const task = getVal(r, 'Задача');
        const key = project + '|' + (task || '');
        if (!idx1[key]) idx1[key] = r;
    }

    const rows = [];
    const seen = new Set();

    for (const r of state.rawSuperset2) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (useMainSet && !mainSet.has(project)) continue;
        const task = getVal(r, 'Задача') || '';
        const key = project + '|' + task;
        seen.add(key);
        const perf = idx1[key] || {};

        const isValidate = project.endsWith('_validate');

        rows.push({
            dateStart: parseExcelDate(getVal(r, 'Дата начала')),
            dateEnd: parseExcelDate(getVal(r, 'Дата окончания')),
            project, task,
            fragments: getVal(r, 'Размечено, шт', 'Размечено шт') || '',
            normQuality: isValidate ? '' : (getVal(r, 'Норма качества') || ''),
            quality: getVal(r, 'Качество') || '',
            comment: isValidate ? '' : (getVal(r, 'Комментарий') || ''),
            withoutQuality: isValidate ? '' : (getVal(r, 'Без качества, шт', 'Без качества шт') || ''),
            ballsPerHour: parseHtmlNumber(getVal(perf, 'Факт баллов/час')),
            prodPerHour: parseHtmlNumber(getVal(perf, 'Кпроизв в час')),
            price: getVal(perf, 'Цена') || '',
            taskType: getVal(perf, 'Тип задания') || ''
        });
    }

    for (const r of state.rawSuperset1) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (useMainSet && !mainSet.has(project)) continue;
        const task = getVal(r, 'Задача') || '';
        const key = project + '|' + task;
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
            dateStart: null, dateEnd: null,
            project, task,
            fragments: getVal(r, 'Размечено, шт', 'Размечено шт') || '',
            normQuality: '', quality: '', comment: '', withoutQuality: '',
            ballsPerHour: parseHtmlNumber(getVal(r, 'Факт баллов/час')),
            prodPerHour: parseHtmlNumber(getVal(r, 'Кпроизв в час')),
            price: getVal(r, 'Цена') || '',
            taskType: getVal(r, 'Тип задания') || ''
        });
    }

    state.superset.table1 = rows;
}

function rebuildTable2() {
    const mainSet = getMainProjects();
    const useMainSet = mainSet.size > 0;
    const { fioToEmail } = state.superset.employeeMap || { fioToEmail: {} };
    const qualityIdx = computeEmployeeQualityIndex();
    const rows = [];

    for (const r of state.rawSuperset3) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (useMainSet && !mainSet.has(project)) continue;

        const fio = getVal(r, 'ФИО') || '';
        const task = getVal(r, 'Задача') || '';
        const date = parseExcelDate(getVal(r, 'Дата'));

        if (!matchesProject(project)) continue;
        if (!matchesDateRangeRow(date)) continue;
        if (!matchesTask(task)) continue;

        const email = fioToEmail[fio.trim()];
        let factQuality = null;
        if (email) {
            const em = email.toLowerCase();
            const ptKey = em + '|' + project + '|' + task;
            const pKey = em + '|' + project;
            if (qualityIdx.byEmailProjectTask[ptKey]) {
                factQuality = avg(qualityIdx.byEmailProjectTask[ptKey]);
            } else if (qualityIdx.byEmailProject[pKey]) {
                factQuality = avg(qualityIdx.byEmailProject[pKey]);
            } else if (qualityIdx.byEmailOnly[em]) {
                factQuality = avg(qualityIdx.byEmailOnly[em]);
            }
        }

        const isValidate = project.endsWith('_validate');

        rows.push({
            date, fio, project, task,
            fragments: getVal(r, 'Размечено, шт', 'Размечено шт') || '',
            balls: getVal(r, 'Размечено, б', 'Размечено б') || '',
            qualitySuperset: getVal(r, 'Качество') || '',
            qualityFact: factQuality,
            norm: isValidate ? '' : (getVal(r, 'Норматив') || ''),
            withoutQuality: isValidate ? '' : (getVal(r, 'Без качества, шт', 'Без качества шт') || '')
        });
    }

    state.superset.table2 = rows;
}

function buildTable3() {
    const mainSet = getMainProjects();
    const useMainSet = mainSet.size > 0;
    const byProject = {};
    for (const r of state.rawSuperset1) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (useMainSet && !mainSet.has(project)) continue;
        const price = getVal(r, 'Цена');
        if (!byProject[project]) byProject[project] = { project, prices: [] };
        if (price != null && price !== '') byProject[project].prices.push(price);
    }

    const projectDates = {};
    for (const r of state.rawSuperset2) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (useMainSet && !mainSet.has(project)) continue;
        const date = parseExcelDate(getVal(r, 'Дата окончания'));
        if (!date) continue;
        if (!projectDates[project] || date > projectDates[project]) projectDates[project] = date;
    }
    for (const r of state.rawSuperset3) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (useMainSet && !mainSet.has(project)) continue;
        const date = parseExcelDate(getVal(r, 'Дата'));
        if (!date) continue;
        if (!projectDates[project] || date > projectDates[project]) projectDates[project] = date;
    }

    const rows = [];
    for (const project in byProject) {
        const prices = byProject[project].prices;
        rows.push({
            date: projectDates[project] || null,
            project,
            price: prices.length > 0 ? prices[0] : ''
        });
    }

    state.superset.table3 = rows;
}

function rebuildTable4() {
    const mainSet = getMainProjects();
    const useMainSet = mainSet.size > 0;
    const { fioToEmail } = state.superset.employeeMap || { fioToEmail: {} };
    const qualityIdx = computeEmployeeQualityIndex();

    const byFio = {};
    for (const r of state.rawSuperset3) {
        const project = normalizeProject(getVal(r, 'Проект'));
        if (useMainSet && !mainSet.has(project)) continue;

        const fio = getVal(r, 'ФИО') || '';
        if (!fio) continue;

        if (!matchesProject(project)) continue;

        const date = parseExcelDate(getVal(r, 'Дата'));
        if (!matchesDateRangeRow(date)) continue;

        const task = getVal(r, 'Задача') || '';
        if (!matchesTask(task)) continue;

        if (!byFio[fio]) byFio[fio] = { fio, norms: [] };
        if (!project.endsWith('_validate')) {
            const norm = parseNorm(getVal(r, 'Норматив'));
            if (norm !== null) byFio[fio].norms.push(norm);
        }
    }

    const rows = [];
    for (const fio in byFio) {
        const email = fioToEmail[fio.trim()];
        let factQuality = null;
        if (email) {
            const em = email.toLowerCase();
            if (qualityIdx.byEmailOnly[em]) {
                factQuality = avg(qualityIdx.byEmailOnly[em]);
            }
        }
        rows.push({
            fio,
            factQuality,
            normQuality: avg(byFio[fio].norms)
        });
    }

    rows.sort((a, b) => a.fio.localeCompare(b.fio));
    state.superset.table4 = rows;
}

function buildKPIs() {
    const t1 = state.superset.filteredTable1;
    const qualities = [];
    const seen = new Set();

    for (const r of state.processedData) {
        if (r.quality == null || !isFinite(r.quality)) continue;
        const proj = normalizeProject(r.project);
        if (state.currentTab !== 'all' && proj && proj !== state.currentTab) continue;
        if (r.date && !matchesDateRangeRow(r.date)) continue;
        
        const key = (r.marker || '') + '|' + proj + '|' + (r.pool || '') + '|' + (r.fileName || '');
        if (seen.has(key)) continue;
        seen.add(key);

        qualities.push(r.quality);
    }
    const qualityFact = avg(qualities);

    const projectNorms = {};
    for (const r of t1) {
        const norm = parseNorm(r.normQuality);
        if (norm !== null && r.project) {
            if (!projectNorms[r.project]) projectNorms[r.project] = new Set();
            projectNorms[r.project].add(norm);
        }
    }
    const allUniqueNorms = [];
    for (const p in projectNorms) {
        projectNorms[p].forEach(n => allUniqueNorms.push(n));
    }
    const qualityPlan = avg(allUniqueNorms);

    const balls = t1.map(r => parseHtmlNumberToFloat(r.ballsPerHour)).filter(v => v !== null);
    const ballsPerHour = avg(balls);

    const prods = t1.map(r => parseHtmlNumberToFloat(r.prodPerHour)).filter(v => v !== null);
    const prodPerHour = avg(prods);

    const prices = t1.map(r => parsePriceToFloat(r.price)).filter(v => v !== null);
    const avgPrice = avg(prices);

    const timesByTask = {};
    for (const r of t1) {
        const priceNum = parsePriceToFloat(r.price);
        const ballsV = parseHtmlNumberToFloat(r.ballsPerHour);
        if (priceNum === null || priceNum <= 0) continue;
        if (ballsV === null || ballsV <= 0) continue;

        const t = (priceNum * 60) / ballsV;
        const key = (r.project || '') + '|' + (r.task || '');
        if (!timesByTask[key]) timesByTask[key] = [];
        timesByTask[key].push(t);
    }

    const taskAverages = [];
    for (const key in timesByTask) {
        const a = avg(timesByTask[key]);
        if (a !== null) taskAverages.push(a);
    }
    const avgTime = avg(taskAverages);

    state.superset.kpis = { qualityFact, qualityPlan, ballsPerHour, prodPerHour, avgTime, avgPrice };
}

export function applySupersetFilters() {
    state.superset._mainProjects = computeMainProjectsSet();

    if (state.currentTab !== 'all' && state.superset._mainProjects.size > 0 && !state.superset._mainProjects.has(state.currentTab)) {
        state.currentTab = 'all';
    }

    const t1Config = getTable1Config();
    const t2Config = getTable2Config();
    const t3Config = getTable3Config();
    const t4Config = getTable4Config();

    state.superset.filteredTable1 = (state.superset.table1 || []).filter(r =>
        matchesProject(r.project) &&
        matchesPeriodRange(r.dateStart, r.dateEnd) &&
        matchesTask(r.task) &&
        matchesColumnFilters('t1', r, t1Config)
    );

    rebuildTable2();
    state.superset.filteredTable2 = (state.superset.table2 || []).filter(r =>
        matchesColumnFilters('t2', r, t2Config)
    );

    state.superset.filteredTable3 = (state.superset.table3 || []).filter(r =>
        matchesProject(r.project) &&
        matchesDateRangeRow(r.date) &&
        matchesColumnFilters('t3', r, t3Config)
    );

    rebuildTable4();
    state.superset.filteredTable4 = (state.superset.table4 || []).filter(r =>
        matchesColumnFilters('t4', r, t4Config)
    );

    buildKPIs();
}

export function buildSuperset() {
    state.superset._mainProjects = computeMainProjectsSet();

    buildNorms();
    buildEmployeeMap();
    buildTable1();
    buildTable3();
    applySupersetFilters();
}

export function getTargetQuality(project, pool) {
    const name = normalizeProject(project);
    if (name.endsWith('_validate')) return null;
    const key = name + '|' + (pool || '');
    if (state.superset.norms.byProjectPool[key] != null) return state.superset.norms.byProjectPool[key];
    if (state.superset.norms.byProject[name] != null) return state.superset.norms.byProject[name];
    return state.superset.norms.globalAvg;
}

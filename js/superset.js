import { state } from './state.js';
import { getVal, parseExcelDate, parseHtmlNumber, parseNorm } from './utils.js';

// Считает фактическое качество из processedData (Markers + Validation):
// по (Проект|Задача) → массив quality, по Проект → массив quality.
function calcFactQuality() {
    const byProjectPool = {};
    const byProject = {};
    for (const r of state.processedData) {
        if (r.quality === null || isNaN(r.quality) || r.quality <= 0) continue;
        const project = (r.project || '').replace(/_validate$/, '').trim();
        if (!project) continue;
        const pool = r.pool || '';
        const key = project + '|' + pool;
        if (!byProjectPool[key]) byProjectPool[key] = [];
        byProjectPool[key].push(r.quality);
        if (!byProject[project]) byProject[project] = [];
        byProject[project].push(r.quality);
    }
    return { byProjectPool, byProject };
}

function avg(arr) {
    if (!arr || arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function buildNorms() {
    const byProjectPool = {};
    const byProject = {};

    // Из Тип 2 (Норма качества)
    for (const r of state.rawSuperset2) {
        const project = getVal(r, 'Проект');
        const task = getVal(r, 'Задача');
        const norm = parseNorm(getVal(r, 'Норма качества'));
        if (norm === null) continue;
        if (project && task) byProjectPool[project + '|' + task] = norm;
        if (project) {
            if (!byProject[project]) byProject[project] = [];
            byProject[project].push(norm);
        }
    }

    // Из Тип 3 (Норматив) — только если в Тип 2 не было
    for (const r of state.rawSuperset3) {
        const project = getVal(r, 'Проект');
        const task = getVal(r, 'Задача');
        const norm = parseNorm(getVal(r, 'Норматив'));
        if (norm === null) continue;
        if (project && task && byProjectPool[project + '|' + task] == null) {
            byProjectPool[project + '|' + task] = norm;
        }
        if (project) {
            if (!byProject[project]) byProject[project] = [];
            byProject[project].push(norm);
        }
    }

    // Среднее по проектам
    const avgByProject = {};
    for (const p in byProject) {
        const a = avg(byProject[p]);
        if (a !== null) avgByProject[p] = a;
    }

    // Глобальное среднее
    const all = [];
    for (const p in byProject) {
        for (const n of byProject[p]) all.push(n);
    }
    const globalAvg = avg(all);

    state.superset.norms = {
        byProjectPool,
        byProject: avgByProject,
        globalAvg
    };
}

function buildTable1() {
    // Индекс из Тип 1 по (Проект, Задача)
    const idx1 = {};
    for (const r of state.rawSuperset1) {
        const project = getVal(r, 'Проект');
        const task = getVal(r, 'Задача');
        const key = (project || '') + '|' + (task || '');
        if (!idx1[key]) idx1[key] = r;
    }

    const rows = [];
    const seen = new Set();

    // Основной источник — Тип 2
    for (const r of state.rawSuperset2) {
        const project = getVal(r, 'Проект') || '';
        const task = getVal(r, 'Задача') || '';
        const key = project + '|' + task;
        seen.add(key);
        const perf = idx1[key] || {};

        rows.push({
            dateStart: parseExcelDate(getVal(r, 'Дата начала')),
            dateEnd: parseExcelDate(getVal(r, 'Дата окончания')),
            project,
            task,
            fragments: getVal(r, 'Размечено, шт', 'Размечено шт') || '',
            normQuality: getVal(r, 'Норма качества') || '',
            quality: getVal(r, 'Качество') || '',
            comment: getVal(r, 'Комментарий') || '',
            withoutQuality: getVal(r, 'Без качества, шт', 'Без качества шт') || '',
            ballsPerHour: parseHtmlNumber(getVal(perf, 'Факт баллов/час')),
            prodPerHour: parseHtmlNumber(getVal(perf, 'Кпроизв в час')),
            price: getVal(perf, 'Цена') || '',
            taskType: getVal(perf, 'Тип задания') || ''
        });
    }

    // Добавляем строки из Тип 1, которых нет в Тип 2
    for (const r of state.rawSuperset1) {
        const project = getVal(r, 'Проект') || '';
        const task = getVal(r, 'Задача') || '';
        const key = project + '|' + task;
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
            dateStart: null,
            dateEnd: null,
            project,
            task,
            fragments: getVal(r, 'Размечено, шт', 'Размечено шт') || '',
            normQuality: '',
            quality: '',
            comment: '',
            withoutQuality: '',
            ballsPerHour: parseHtmlNumber(getVal(r, 'Факт баллов/час')),
            prodPerHour: parseHtmlNumber(getVal(r, 'Кпроизв в час')),
            price: getVal(r, 'Цена') || '',
            taskType: getVal(r, 'Тип задания') || ''
        });
    }

    state.superset.table1 = rows;
}

function buildTable2() {
    const { byProjectPool, byProject } = calcFactQuality();
    const rows = [];

    for (const r of state.rawSuperset3) {
        const project = getVal(r, 'Проект') || '';
        const task = getVal(r, 'Задача') || '';
        const key = project + '|' + task;

        let factQuality = null;
        if (byProjectPool[key]) {
            factQuality = avg(byProjectPool[key]);
        } else if (byProject[project]) {
            factQuality = avg(byProject[project]);
        }

        rows.push({
            date: parseExcelDate(getVal(r, 'Дата')),
            fio: getVal(r, 'ФИО') || '',
            project,
            task,
            fragments: getVal(r, 'Размечено, шт', 'Размечено шт') || '',
            balls: getVal(r, 'Размечено, б', 'Размечено б') || '',
            qualitySuperset: getVal(r, 'Качество') || '',
            qualityFact: factQuality,
            norm: getVal(r, 'Норматив') || '',
            withoutQuality: getVal(r, 'Без качества, шт', 'Без качества шт') || ''
        });
    }

    state.superset.table2 = rows;
}

function buildTable3() {
    // Группировка по проекту из Тип 1
    const byProject = {};
    for (const r of state.rawSuperset1) {
        const project = getVal(r, 'Проект');
        const price = getVal(r, 'Цена');
        if (!project) continue;
        if (!byProject[project]) byProject[project] = { project, prices: [] };
        if (price != null && price !== '') byProject[project].prices.push(price);
    }

    // Дата из Тип 2 (max Дата окончания)
    const projectDates = {};
    for (const r of state.rawSuperset2) {
        const project = getVal(r, 'Проект');
        const date = parseExcelDate(getVal(r, 'Дата окончания'));
        if (!project || !date) continue;
        if (!projectDates[project] || date > projectDates[project]) {
            projectDates[project] = date;
        }
    }
    // Fallback — из Тип 3
    for (const r of state.rawSuperset3) {
        const project = getVal(r, 'Проект');
        const date = parseExcelDate(getVal(r, 'Дата'));
        if (!project || !date) continue;
        if (!projectDates[project] || date > projectDates[project]) {
            projectDates[project] = date;
        }
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

function buildCards() {
    const { byProject } = calcFactQuality();
    const cards = [];
    for (const project in byProject) {
        const a = avg(byProject[project]);
        if (a === null) continue;
        cards.push({ project, factQuality: a });
    }
    state.superset.cards = cards.sort((a, b) => a.project.localeCompare(b.project));
}

export function buildSuperset() {
    buildNorms();
    buildTable1();
    buildTable2();
    buildTable3();
    buildCards();
}

// Целевое качество по (project, pool) → project → globalAvg
export function getTargetQuality(project, pool) {
    const cleanProject = (project || '').replace(/_validate$/, '').trim();
    const key = cleanProject + '|' + (pool || '');
    if (state.superset.norms.byProjectPool[key] != null) return state.superset.norms.byProjectPool[key];
    if (state.superset.norms.byProject[cleanProject] != null) return state.superset.norms.byProject[cleanProject];
    return state.superset.norms.globalAvg;
}
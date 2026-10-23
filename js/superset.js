import { state } from './state.js';
import { getVal, parseExcelDate, parseHtmlNumber, parseNorm } from './utils.js';

// ===== Вспомогательные =====
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

// Парсер HTML-числа в float: "<div>572.2</div>" → 572.2
function parseHtmlNumberToFloat(val) {
    if (val == null) return null;
    const s = parseHtmlNumber(val);   // "572,2"
    if (!s) return null;
    const n = parseFloat(String(s).replace(',', '.'));
    return isNaN(n) ? null : n;
}

// ===== Нормативы (для главной и графиков) =====
function buildNorms() {
    const byProjectPool = {};
    const byProject = {};

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

    const avgByProject = {};
    for (const p in byProject) {
        const a = avg(byProject[p]);
        if (a !== null) avgByProject[p] = a;
    }

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

// ===== Таблица 1 (проект + задача) =====
function buildTable1() {
    const idx1 = {};
    for (const r of state.rawSuperset1) {
        const project = getVal(r, 'Проект');
        const task = getVal(r, 'Задача');
        const key = (project || '') + '|' + (task || '');
        if (!idx1[key]) idx1[key] = r;
    }

    const rows = [];
    const seen = new Set();

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

// ===== Таблица 2 (по дням / ФИО) =====
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

// ===== Таблица 3 (цены по проектам) =====
function buildTable3() {
    const byProject = {};
    for (const r of state.rawSuperset1) {
        const project = getVal(r, 'Проект');
        const price = getVal(r, 'Цена');
        if (!project) continue;
        if (!byProject[project]) byProject[project] = { project, prices: [] };
        if (price != null && price !== '') byProject[project].prices.push(price);
    }

    const projectDates = {};
    for (const r of state.rawSuperset2) {
        const project = getVal(r, 'Проект');
        const date = parseExcelDate(getVal(r, 'Дата окончания'));
        if (!project || !date) continue;
        if (!projectDates[project] || date > projectDates[project]) projectDates[project] = date;
    }
    for (const r of state.rawSuperset3) {
        const project = getVal(r, 'Проект');
        const date = parseExcelDate(getVal(r, 'Дата'));
        if (!project || !date) continue;
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

// ===== Карточки: Качество факт. =====
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

// ===== Карточки: Факт баллов/час и Кпроизв в час =====
function buildPerformanceCards() {
    const ballsByProject = {};
    const prodByProject = {};

    for (const r of state.rawSuperset1) {
        const project = getVal(r, 'Проект');
        if (!project) continue;

        const balls = parseHtmlNumberToFloat(getVal(r, 'Факт баллов/час'));
        if (balls !== null) {
            if (!ballsByProject[project]) ballsByProject[project] = [];
            ballsByProject[project].push(balls);
        }

        const prod = parseHtmlNumberToFloat(getVal(r, 'Кпроизв в час'));
        if (prod !== null) {
            if (!prodByProject[project]) prodByProject[project] = [];
            prodByProject[project].push(prod);
        }
    }

    const ballsCards = Object.keys(ballsByProject).map(p => ({
        project: p,
        avg: avg(ballsByProject[p])
    })).filter(x => x.avg !== null)
      .sort((a, b) => a.project.localeCompare(b.project));

    const prodCards = Object.keys(prodByProject).map(p => ({
        project: p,
        avg: avg(prodByProject[p])
    })).filter(x => x.avg !== null)
      .sort((a, b) => a.project.localeCompare(b.project));

    state.superset.ballsCards = ballsCards;
    state.superset.prodCards = prodCards;
}

// ===== Общая сборка =====
export function buildSuperset() {
    buildNorms();
    buildTable1();
    buildTable2();
    buildTable3();
    buildCards();
    buildPerformanceCards();
}

// Целевое качество для главной/графиков
export function getTargetQuality(project, pool) {
    const cleanProject = (project || '').replace(/_validate$/, '').trim();
    const key = cleanProject + '|' + (pool || '');
    if (state.superset.norms.byProjectPool[key] != null) return state.superset.norms.byProjectPool[key];
    if (state.superset.norms.byProject[cleanProject] != null) return state.superset.norms.byProject[cleanProject];
    return state.superset.norms.globalAvg;
}

// js/report.js — генерация автономного HTML-отчёта
// Изменено: имя файла формируется по проектам + дате (было: Валидатор_PRO_Отчет_YYYY-MM-DD.html)

import { state } from './state.js';
import { escapeHtml, formatDate } from './utils.js';

// Генерирует автономный HTML-файл с дашбордом "Главная".
export async function generateHtmlReport() {
    if (state.processedData.length === 0 && state.feedbackData.length === 0) {
        alert('Нет данных для отчёта');
        return;
    }

    let cssText, chartJsText, runtimeText;
    try {
        const results = await Promise.all([
            fetch('css/styles.css').then(function (r) {
                if (!r.ok) throw new Error('css/styles.css: ' + r.status);
                return r.text();
            }),
            fetch('chart.umd.min.js').then(function (r) {
                if (!r.ok) throw new Error('chart.umd.min.js: ' + r.status);
                return r.text();
            }),
            fetch('js/report-runtime.js').then(function (r) {
                if (!r.ok) throw new Error('js/report-runtime.js: ' + r.status);
                return r.text();
            })
        ]);
        cssText = results[0];
        chartJsText = results[1];
        runtimeText = results[2];
    } catch (err) {
        alert('Не удалось собрать отчёт: ' + err.message + '\n\n' +
              'Убедитесь, что файлы css/styles.css, chart.umd.min.js и js/report-runtime.js ' +
              'доступны по тому же адресу, что и страница.');
        return;
    }

    // === Динамические табы проектов ===
    const projectSet = new Set();
    for (const r of state.processedData) {
        if (!r.project) continue;
        const name = String(r.project).replace(/_validate$/, '').trim();
        if (name) projectSet.add(name);
    }
    const projects = Array.from(projectSet).sort();
    const showTabs = projects.length > 1;

    let tabsHtml = '';
    if (showTabs) {
        tabsHtml = '<div class="tabs" id="projectTabs">';
        tabsHtml += '<div class="tab active" data-tab="all">Все</div>';
        for (const p of projects) {
            const safe = escapeHtml(p);
            tabsHtml += '<div class="tab" data-tab="' + safe + '">' + safe + '</div>';
        }
        tabsHtml += '</div>';
    }

    const safeChartJs = chartJsText.replace(/<\/script>/gi, '<\\/script>');
    const safeRuntime = runtimeText.replace(/<\/script>/gi, '<\\/script>');
    const safeCss = cssText.replace(/<\/style>/gi, '<\\/style>');

    const targetQuality = state.superset.norms.globalAvg;

    const reportData = {
        processedData: state.processedData,
        feedbackData: state.feedbackData,
        targetQuality: targetQuality
    };
    const reportDataJson = JSON.stringify(reportData).replace(/</g, '\\u003c');

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Валидатор PRO — Отчёт по валидации</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📊</text></svg>">
<style>${safeCss}</style>
</head>
<body>

<header class="top-bar" id="topBar">
    <div class="brand">
        <span class="brand-accent">Валидатор</span>
        <span class="brand-pro">PRO</span>
    </div>
    ${tabsHtml}
</header>

<div class="main-container">
    <main class="content">
        <section class="section active">

            <div class="filters">
                <div class="filter-group">
                    <label>Пул</label>
                    <div class="multi-select" id="msPool">
                        <div class="ms-header" onclick="toggleDropdown('msPool')">
                            <span class="ms-label empty" id="msPool_label">Все пулы</span>
                            <span class="ms-arrow">▼</span>
                        </div>
                        <div class="ms-dropdown" id="msPool_dropdown">
                            <input type="text" class="ms-search" placeholder="Поиск..." onkeyup="filterMsOptions(this)">
                            <label class="ms-item ms-all"><input type="checkbox" id="msPool_all" onchange="toggleAll('msPool', 'pool')"> Выбрать все</label>
                            <div id="msPool_options"></div>
                        </div>
                    </div>
                </div>
                <div class="filter-group">
                    <label>Почта разметчика</label>
                    <div class="multi-select" id="msMarker">
                        <div class="ms-header" onclick="toggleDropdown('msMarker')">
                            <span class="ms-label empty" id="msMarker_label">Все</span>
                            <span class="ms-arrow">▼</span>
                        </div>
                        <div class="ms-dropdown" id="msMarker_dropdown">
                            <input type="text" class="ms-search" placeholder="Поиск..." onkeyup="filterMsOptions(this)">
                            <label class="ms-item ms-all"><input type="checkbox" id="msMarker_all" onchange="toggleAll('msMarker', 'marker')"> Выбрать все</label>
                            <div id="msMarker_options"></div>
                        </div>
                    </div>
                </div>
                <div class="filter-group">
                    <label>Итог</label>
                    <div class="multi-select" id="msResult">
                        <div class="ms-header" onclick="toggleDropdown('msResult')">
                            <span class="ms-label empty" id="msResult_label">Все</span>
                            <span class="ms-arrow">▼</span>
                        </div>
                        <div class="ms-dropdown" id="msResult_dropdown">
                            <input type="text" class="ms-search" placeholder="Поиск..." onkeyup="filterMsOptions(this)">
                            <label class="ms-item ms-all"><input type="checkbox" id="msResult_all" onchange="toggleAll('msResult', 'result')"> Выбрать все</label>
                            <div id="msResult_options"></div>
                        </div>
                    </div>
                </div>
                <div class="filter-group"><label>Дата с</label><input type="date" id="filterDateFrom"></div>
                <div class="filter-group"><label>Дата по</label><input type="date" id="filterDateTo"></div>
                <button id="btnResetFilters" style="height:40px;">Сбросить</button>
            </div>

            <div class="kpi-row">
                <div class="kpi-card"><div class="label">Всего размеченных фрагментов</div><div class="value" id="kpiTotalFragments">0</div></div>
                <div class="kpi-card"><div class="label">Разметчиков</div><div class="value" id="kpiTotalMarkers">0</div></div>
                <div class="kpi-card"><div class="label">Целевое качество</div><div class="value" id="kpiTargetQuality">—</div></div>
                <div class="kpi-card"><div class="label">Ошибок</div><div class="value" id="kpiErrorsPercent">0%</div></div>
                <div class="kpi-card"><div class="label">Качество</div><div class="value" id="kpiQuality">—</div></div>
            </div>

            <div class="table-card">
                <table id="dataTable">
                    <thead>
                        <tr>
                            <th>Дата</th><th>Проект</th><th>Пул</th><th>Разметчик</th><th>Файл</th>
                            <th>Итог</th><th>Тип ошибки</th><th>Комментарий</th><th>Интервал</th>
                            <th>Качество</th><th>Ссылка</th><th>Связь</th>
                        </tr>
                    </thead>
                    <tbody id="tableBody"></tbody>
                </table>
                <div class="pagination-container" id="pagination-data">
                    <div class="pagination-info" id="pagination-data-info">Показано 0-0 из 0</div>
                    <div class="pagination-controls" id="pagination-data-controls"></div>
                </div>
            </div>

            <div class="charts-grid">
                <div class="chart-card"><h3>Среднее качество по разметчикам</h3><canvas id="chartQuality"></canvas></div>
                <div class="chart-card"><h3>Распределение типов ошибок</h3><canvas id="chartErrors"></canvas></div>
                <div class="chart-card"><h3>Качество по пулам</h3><canvas id="chartPoolQuality"></canvas></div>
                <div class="chart-card"><h3>Качество по дням</h3><canvas id="chartDayQuality"></canvas></div>
                <div class="chart-card"><h3>Типы ошибок по разметчикам</h3><canvas id="chartErrorsByMarker"></canvas></div>
                <div class="chart-card"><h3>Динамика по датам</h3><canvas id="chartTrend"></canvas></div>
            </div>

            <h2 style="margin-top: 40px; margin-bottom: 20px;">Обратная связь</h2>
            <div class="table-card">
                <table id="fbTableHome">
                    <thead>
                        <tr>
                            <th>Дата</th><th>Разметчик</th><th>Тип ВКС</th><th>Провел</th>
                            <th>Статус</th><th>Проект</th><th>Пулы с ошибками</th><th>Ср. качество за период</th>
                        </tr>
                    </thead>
                    <tbody id="fbTableBodyHome"></tbody>
                </table>
                <div class="pagination-container" id="pagination-fbHome">
                    <div class="pagination-info" id="pagination-fbHome-info">Показано 0-0 из 0</div>
                    <div class="pagination-controls" id="pagination-fbHome-controls"></div>
                </div>
            </div>

            <footer class="page-footer">
                <a href="https://www.flaticon.com/ru/free-icons/" title="статистика иконки" target="_blank" rel="noopener noreferrer">Статистика иконки от Flat-icons-com - Flaticon</a>
            </footer>

        </section>
    </main>
</div>

<script>${safeChartJs}</script>
<script id="report-data" type="application/json">${reportDataJson}</script>
<script>${safeRuntime}</script>
</body>
</html>`;

    // === Формируем имя файла по проектам ===
    const projectNames = [];
    const seen = new Set();
    for (const r of state.processedData) {
        const p = (r.project || '').replace(/_validate$/, '').trim();
        if (p && !seen.has(p)) {
            seen.add(p);
            projectNames.push(p);
        }
    }

    const dateStr = formatDate(new Date());

    function sanitizeForFilename(str) {
        return String(str).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 50);
    }

    let fileBase;
    if (projectNames.length === 0) {
        fileBase = `Отчёт_обн_${dateStr}`;
    } else if (projectNames.length === 1) {
        fileBase = `Отчёт_по_проекту_${sanitizeForFilename(projectNames[0])}_обн_${dateStr}`;
    } else {
        const shown = projectNames.slice(0, 3);
        const suffix = projectNames.length > 3 ? '_и_др' : '';
        fileBase = `Отчёт_по_проектам_${shown.map(sanitizeForFilename).join('_')}${suffix}_обн_${dateStr}`;
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

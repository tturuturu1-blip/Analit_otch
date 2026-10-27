// js/report.js — ОБНОВЛЕНО: Передача данных для новых 9 карточек KPI

import { state } from './state.js';
import { escapeHtml, formatDate, parseExcelDate } from './utils.js';

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

    // === Нормализация дат в dd.mm.yy (TZ-фикс) ===
    const serializedProcessedData = state.processedData.map(r => {
        const copy = Object.assign({}, r);
        if (r.date) copy.date = formatDate(r.date);
        else copy.date = null;
        return copy;
    });

    const serializedFeedbackData = state.feedbackData.map(f => {
        const copy = Object.assign({}, f);
        if (f.date) {
            const parsed = parseExcelDate(f.date);
            copy.date = parsed ? formatDate(parsed) : f.date;
        }
        return copy;
    });

    const reportData = {
        processedData: serializedProcessedData,
        feedbackData: serializedFeedbackData,
        targetQuality: targetQuality,
        supersetTable1: state.superset.table1 || [], // ★ ДОБАВЛЕНО: для расчета KPI на главной
        norms: state.superset.norms || { byProjectPool: {}, byProject: {}, globalAvg: null } // ★ ДОБАВЛЕНО
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

<div class="main-container" style="display: flex; flex: 1; overflow: hidden; padding: 15px 20px 20px 20px;">
    <main class="content" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 20px;">
        <section class="section active" style="display: flex; flex-direction: column; gap: 20px;">

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

            <!-- ★ ИЗМЕНЕНО: Контейнер для 9 карточек KPI -->
            <div class="kpi-row" id="mainKpisContainer"></div>

            <div class="table-card">
                <div class="table-header">
                    <h3>Результаты валидации</h3>
                </div>
                <table id="dataTable">
                    <thead>
                        <tr>
                            <th>Дата</th><th>Проект</th><th>Пул</th><th>Разметчик</th><th>Файл</th>
                            <th colspan="4" style="padding: 0;">
                                <div class="th-grid">
                                    <div>Итог</div>
                                    <div>Тип ошибки</div>
                                    <div>Комментарий</div>
                                    <div>Интервал</div>
                                </div>
                            </th>
                            <th>Качество</th><th>Ссылка</th>
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
                <div class="chart-card">
                    <h3>Качество по разметчикам</h3>
                    <canvas id="chartQuality"></canvas>
                </div>
                
                <div class="chart-card">
                    <h3>Распределение типов ошибок</h3>
                    <canvas id="chartErrors"></canvas>
                </div>
            </div>

            <div class="charts-grid full-width">
                <div class="chart-card">
                    <h3>Качество по пулам</h3>
                    <canvas id="chartPoolQuality"></canvas>
                </div>
            </div>

            <div class="charts-grid">
                <div class="chart-card">
                    <h3>Качество по дням</h3>
                    <canvas id="chartDayQuality"></canvas>
                </div>
                
                <div class="chart-card">
                    <h3>Типы ошибок по разметчикам</h3>
                    <canvas id="chartErrorsByMarker"></canvas>
                </div>
            </div>

            <div class="table-card">
                <div class="table-header">
                    <h3>Обратные связи</h3>
                </div>
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

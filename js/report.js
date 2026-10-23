import { state } from './state.js';
import { escapeHtml } from './utils.js';

// Генерирует автономный HTML-файл с дашбордом "Главная".
// Табы проектов формируются динамически из state.processedData.
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

    const reportData = {
        processedData: state.processedData,
        feedbackData: state.feedbackData
    };
    const reportDataJson = JSON.stringify(reportData).replace(/</g, '\\u003c');

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ГС PRO — Отчёт по валидации</title>
<style>${cssText}</style>
</head>
<body>

<header class="top-bar" id="topBar">
    <div class="brand">ГС PRO</div>
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
                <button id="btnResetFilters" style="height:38px; margin-bottom:1px;">Сбросить</button>
            </div>

            <div class="kpi-row">
                <div class="kpi-card"><div class="label">Всего размеченных фрагментов</div><div class="value" id="kpiTotalFragments">0</div></div>
                <div class="kpi-card"><div class="label">Разметчиков</div><div class="value" id="kpiTotalMarkers">0</div></div>
                <div class="kpi-card"><div class="label">Ошибок</div><div class="value" id="kpiErrorsPercent">0%</div></div>
                <div class="kpi-card"><div class="label">Качество</div><div class="value" id="kpiQuality">—</div></div>
            </div>

            <div class="table-card">
                <table id="dataTable">
                    <thead>
                        <tr>
                            <th>Дата</th><th>Проект</th><th>Пул</th><th>Разметчик</th><th>Файл</th>
                            <th>Итог</th><th>Тип ошибки</th><th>Комментарий</th><th>Интервал</th>
                            <th>Качество</th><th>Связь</th>
                        </tr>
                    </thead>
                    <tbody id="tableBody"></tbody>
                </table>
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
                            <th>Статус</th><th>Пулы с ошибками</th><th>Ср. качество за период</th>
                        </tr>
                    </thead>
                    <tbody id="fbTableBodyHome"></tbody>
                </table>
            </div>

        </section>
    </main>
</div>

<script>${safeChartJs}</script>
<script id="report-data" type="application/json">${reportDataJson}</script>
<script>${safeRuntime}</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ГС_PRO_Отчет_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

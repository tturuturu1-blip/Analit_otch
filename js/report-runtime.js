(function () {
    'use strict';

    var REPORT_DATA = JSON.parse(document.getElementById('report-data').textContent);
    var processedData = REPORT_DATA.processedData || [];
    var feedbackData = REPORT_DATA.feedbackData || [];

    var filteredData = [];
    var charts = {};
    var currentTab = 'all';
    var filterState = {
        pool: new Set(),
        marker: new Set(),
        result: new Set()
    };

    // ===== Утилиты =====
    function formatDate(d) {
        if (!d) return '';
        var dt = new Date(d);
        if (isNaN(dt.getTime())) return '';
        return String(dt.getDate()).padStart(2, '0') + '.' +
               String(dt.getMonth() + 1).padStart(2, '0') + '.' + dt.getFullYear();
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ===== Проект по пулам (fallback) =====
    function deriveProjectFromPools(poolsStr) {
        if (!poolsStr) return null;
        var pools = String(poolsStr).split(',').map(function (p) { return p.trim(); }).filter(Boolean);
        for (var i = 0; i < pools.length; i++) {
            for (var j = 0; j < processedData.length; j++) {
                if (processedData[j].pool === pools[i] && processedData[j].project) {
                    return processedData[j].project.replace(/_validate$/, '').trim();
                }
            }
        }
        return null;
    }

    // ===== Фильтр по проекту =====
    function matchesTab(r) {
        if (currentTab === 'all') return true;
        var project = (r.project || '').replace(/_validate$/, '').trim();
        return project === currentTab;
    }

    function applyFilters() {
        var from = document.getElementById('filterDateFrom').value;
        var to = document.getElementById('filterDateTo').value;
        var fromDate = from ? new Date(from) : null;
        var toDate = to ? new Date(to) : null;
        if (toDate) toDate.setDate(toDate.getDate() + 1);

        var poolEmpty = filterState.pool.size === 0;
        var markerEmpty = filterState.marker.size === 0;
        var resultEmpty = filterState.result.size === 0;

        filteredData = processedData.filter(function (r) {
            if (!matchesTab(r)) return false;
            if (!poolEmpty && !filterState.pool.has(r.pool || '')) return false;
            if (!markerEmpty && !filterState.marker.has(r.marker || '')) return false;
            if (!resultEmpty && !filterState.result.has(r.result || '')) return false;
            if (fromDate && r.date) {
                var rDateFrom = new Date(r.date);
                if (rDateFrom < fromDate) return false;
            }
            if (toDate && r.date) {
                var rDateTo = new Date(r.date);
                if (rDateTo >= toDate) return false;
            }
            return true;
        });
    }

    // ===== KPI =====
    function updateKPI() {
        var uniqueFiles = new Set();
        var totalFragments = 0;

        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (r._type !== 'validation') continue;
            var fileKey = r.marker + '|' + r.fileName + '|' + r.fragments;
            if (!uniqueFiles.has(fileKey)) {
                uniqueFiles.add(fileKey);
                totalFragments += (r.fragments || 0);
            }
        }

        var uniqueMarkers = new Set();
        var errorsCount = 0;
        var qualitySum = 0, qualityCount = 0;

        for (var j = 0; j < filteredData.length; j++) {
            var rr = filteredData[j];
            if (rr.marker) uniqueMarkers.add(rr.marker);
            if (rr.result === 'Ошибка') errorsCount++;
            if (rr.quality !== null && !isNaN(rr.quality) && rr.quality > 0) {
                qualitySum += rr.quality;
                qualityCount++;
            }
        }

        var errorPercent = totalFragments > 0 ? (errorsCount / totalFragments) * 100 : 0;
        var avgQ = qualityCount ? qualitySum / qualityCount : null;

        document.getElementById('kpiTotalFragments').textContent = totalFragments;
        document.getElementById('kpiTotalMarkers').textContent = uniqueMarkers.size;
        document.getElementById('kpiErrorsPercent').textContent = errorPercent.toFixed(2) + '%';
        document.getElementById('kpiQuality').textContent = avgQ !== null ? (avgQ * 100).toFixed(1) + '%' : '—';
    }

    // ===== Графики =====
    function destroyChart(k) {
        if (charts[k]) {
            try { charts[k].destroy(); } catch (e) { /* ignore */ }
            delete charts[k];
        }
    }

    function buildQualityChart() {
        destroyChart('quality');
        var byMarker = {};
        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (r.marker && r.quality !== null && !isNaN(r.quality) && r.quality > 0) {
                if (!byMarker[r.marker]) byMarker[r.marker] = [];
                byMarker[r.marker].push(r.quality);
            }
        }
        var labels = Object.keys(byMarker).sort();
        var values = labels.map(function (m) {
            var arr = byMarker[m];
            var sum = 0;
            for (var k = 0; k < arr.length; k++) sum += arr[k];
            return (sum / arr.length) * 100;
        });
        charts.quality = new Chart(document.getElementById('chartQuality'), {
            type: 'bar',
            data: {
                labels: labels.map(function (l) { return l.length > 25 ? l.slice(0, 22) + '…' : l; }),
                datasets: [
                    {
                        label: 'Ср. качество, %',
                        data: values,
                        backgroundColor: values.map(function (v) { return v < 98 ? '#ef4444' : v < 99 ? '#f59e0b' : '#10b981'; }),
                        borderRadius: 4, order: 2
                    },
                    { label: 'Норма 98%', data: Array(labels.length).fill(98), type: 'line', borderDash: [5, 5], borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, order: 1 },
                    { label: 'Норма 99%', data: Array(labels.length).fill(99), type: 'line', borderDash: [5, 5], borderColor: '#ef4444', borderWidth: 2, pointRadius: 0, order: 1 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } },
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: function (v) { return v + '%'; }, color: '#2e1065' } },
                    x: { ticks: { color: '#2e1065' } }
                }
            }
        });
    }

    function buildErrorChart() {
        destroyChart('errors');
        var byType = {};
        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (r.errorType) byType[r.errorType] = (byType[r.errorType] || 0) + 1;
        }
        charts.errors = new Chart(document.getElementById('chartErrors'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(byType),
                datasets: [{ data: Object.keys(byType).map(function (k) { return byType[k]; }), backgroundColor: ['#1d9bf0', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } } }
        });
    }

    function buildPoolQualityChart() {
        destroyChart('poolQuality');
        var byPool = {};
        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (r.pool && r.quality !== null && !isNaN(r.quality) && r.quality > 0) {
                if (!byPool[r.pool]) byPool[r.pool] = [];
                byPool[r.pool].push(r.quality);
            }
        }
        var labels = Object.keys(byPool).sort();
        var values = labels.map(function (p) {
            var arr = byPool[p];
            var sum = 0;
            for (var k = 0; k < arr.length; k++) sum += arr[k];
            return (sum / arr.length) * 100;
        });
        charts.poolQuality = new Chart(document.getElementById('chartPoolQuality'), {
            type: 'bar',
            data: {
                labels: labels.map(function (l) { return l.length > 30 ? l.slice(0, 27) + '…' : l; }),
                datasets: [
                    {
                        label: 'Ср. качество, %',
                        data: values,
                        backgroundColor: values.map(function (v) { return v < 98 ? '#ef4444' : v < 99 ? '#f59e0b' : '#10b981'; }),
                        borderRadius: 4, order: 2
                    },
                    { label: 'Норма 98%', data: Array(labels.length).fill(98), type: 'line', borderDash: [5, 5], borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, order: 1 },
                    { label: 'Норма 99%', data: Array(labels.length).fill(99), type: 'line', borderDash: [5, 5], borderColor: '#ef4444', borderWidth: 2, pointRadius: 0, order: 1 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } },
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: function (v) { return v + '%'; }, color: '#2e1065' } },
                    x: { ticks: { color: '#2e1065' } }
                }
            }
        });
    }

    function buildDayQualityChart() {
        destroyChart('dayQuality');
        var byDate = {};
        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (r.date && r.quality !== null && !isNaN(r.quality) && r.quality > 0) {
                var k = formatDate(r.date);
                if (!byDate[k]) byDate[k] = [];
                byDate[k].push(r.quality);
            }
        }
        var labels = Object.keys(byDate).sort(function (a, b) {
            return a.split('.').reverse().join('-').localeCompare(b.split('.').reverse().join('-'));
        });
        var values = labels.map(function (d) {
            var arr = byDate[d];
            var sum = 0;
            for (var k = 0; k < arr.length; k++) sum += arr[k];
            return (sum / arr.length) * 100;
        });
        var targetLine = labels.map(function (d) {
            var p = d.split('.');
            return new Date(p[2], p[1] - 1, p[0]) < new Date(2026, 9, 20) ? 98 : 99;
        });
        charts.dayQuality = new Chart(document.getElementById('chartDayQuality'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Ср. качество, %', data: values, borderColor: '#1d9bf0', backgroundColor: 'rgba(29, 155, 240, 0.1)', tension: .3, fill: true, pointRadius: 4, order: 2 },
                    { label: 'Контрольная линия', data: targetLine, borderColor: '#ef4444', borderDash: [5, 5], borderWidth: 2, pointRadius: 0, stepped: true, order: 1 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } },
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: function (v) { return v + '%'; }, color: '#2e1065' } },
                    x: { ticks: { color: '#2e1065' } }
                }
            }
        });
    }

    function buildErrorsByMarkerChart() {
        destroyChart('errorsByMarker');
        var markersSet = new Set();
        var typesSet = new Set();
        for (var i = 0; i < filteredData.length; i++) {
            if (filteredData[i].marker) markersSet.add(filteredData[i].marker);
            if (filteredData[i].errorType) typesSet.add(filteredData[i].errorType);
        }
        var markers = Array.from(markersSet).sort();
        var errorTypes = Array.from(typesSet).sort();
        var colors = ['#ef4444', '#f59e0b', '#1d9bf0', '#10b981', '#8b5cf6', '#ec4899'];

        var datasets = errorTypes.map(function (type, idx) {
            return {
                label: type,
                data: markers.map(function (m) {
                    var c = 0;
                    for (var j = 0; j < filteredData.length; j++) {
                        if (filteredData[j].marker === m && filteredData[j].errorType === type) c++;
                    }
                    return c;
                }),
                backgroundColor: colors[idx % colors.length]
            };
        });

        charts.errorsByMarker = new Chart(document.getElementById('chartErrorsByMarker'), {
            type: 'bar',
            data: { labels: markers.map(function (m) { return m.length > 20 ? m.slice(0, 18) + '…' : m; }), datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } },
                scales: {
                    x: { stacked: true, ticks: { color: '#2e1065' } },
                    y: { stacked: true, beginAtZero: true, ticks: { color: '#2e1065' } }
                }
            }
        });
    }

    function buildTrendChart() {
        destroyChart('trend');
        var byDate = {};
        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (!r.date) continue;
            var k = formatDate(r.date);
            if (!byDate[k]) byDate[k] = { errors: 0, recs: 0 };
            if (r.result === 'Ошибка') byDate[k].errors++;
            if (r.result === 'Рекомендация') byDate[k].recs++;
        }
        var labels = Object.keys(byDate).sort(function (a, b) {
            return a.split('.').reverse().join('-').localeCompare(b.split('.').reverse().join('-'));
        });
        charts.trend = new Chart(document.getElementById('chartTrend'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Ошибки', data: labels.map(function (l) { return byDate[l].errors; }), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: .3, fill: true },
                    { label: 'Рекомендации', data: labels.map(function (l) { return byDate[l].recs; }), borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', tension: .3, fill: true }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#2e1065' } } },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#2e1065' } },
                    x: { ticks: { color: '#2e1065' } }
                }
            }
        });
    }

    // ===== Таблица данных =====
    function buildTable() {
        var tbody = document.getElementById('tableBody');
        var rows = filteredData.slice(0, 300);
        var html = '';
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var badgeClass = r.result === 'Ошибка' ? 'badge-error'
                : r.result === 'Рекомендация' ? 'badge-rec'
                : 'badge-ok';
            var link = r.result === 'Рекомендация'
                ? (r._linked
                    ? '<span class="badge badge-linked">связано</span>'
                    : '<span class="badge" style="background:#fee2e2;color:#ef4444">нет пары</span>')
                : '';
            var fileName = r.fileName ? escapeHtml(r.fileName.slice(0, 40)) : '';
            var fileNameTitle = escapeHtml(r.fileName || '');
            var comment = r.comment ? escapeHtml(r.comment.slice(0, 60)) : '';
            var commentTitle = escapeHtml(r.comment || '');
            var quality = (r.quality !== null && !isNaN(r.quality))
                ? (r.quality * 100).toFixed(1) + '%'
                : '';
            html += '<tr>' +
                '<td>' + (r.date ? formatDate(r.date) : '') + '</td>' +
                '<td>' + escapeHtml((r.project || '').replace('_validate', '')) + '</td>' +
                '<td>' + escapeHtml(r.pool || '') + '</td>' +
                '<td>' + escapeHtml(r.marker || '') + '</td>' +
                '<td title="' + fileNameTitle + '">' + fileName + '</td>' +
                '<td><span class="badge ' + badgeClass + '">' + escapeHtml(r.result || '') + '</span></td>' +
                '<td>' + escapeHtml(r.errorType || '') + '</td>' +
                '<td title="' + commentTitle + '">' + comment + '</td>' +
                '<td>' + escapeHtml(r.interval || '') + '</td>' +
                '<td>' + quality + '</td>' +
                '<td>' + link + '</td>' +
            '</tr>';
        }
        tbody.innerHTML = html;
    }

    // ===== Таблица ОС на главной (без кнопок) =====
    function renderFeedbackTableHome() {
        var tbody = document.getElementById('fbTableBodyHome');
        if (!tbody) return;

        var validMarkers = new Set();
        if (currentTab !== 'all') {
            for (var i = 0; i < processedData.length; i++) {
                if (matchesTab(processedData[i])) validMarkers.add(processedData[i].marker);
            }
        }

        var filtered = feedbackData.filter(function (f) {
            if (currentTab === 'all') return true;
            var proj = f.project || deriveProjectFromPools(f.pools);
            if (proj) return proj === currentTab;
            return validMarkers.has(f.marker);
        });

        filtered.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

        var html = '';
        for (var j = 0; j < filtered.length; j++) {
            var f = filtered[j];
            var statusColor = f.status === 'Проведена' ? '#10b981'
                : f.status === 'Отменена' ? '#ef4444'
                : f.status === 'Перенесена' ? '#f59e0b'
                : '#1d9bf0';
            var avgQText = (f.avgQuality !== undefined && f.avgQuality !== null)
                ? (f.avgQuality * 100).toFixed(1) + '%'
                : '—';
            var displayProject = f.project || deriveProjectFromPools(f.pools) || '—';
            html += '<tr>' +
                '<td>' + escapeHtml(f.date || '') + '</td>' +
                '<td>' + escapeHtml(f.marker || '') + '</td>' +
                '<td>' + escapeHtml(f.typeVKS || '—') + '</td>' +
                '<td>' + escapeHtml(f.conductor || '—') + '</td>' +
                '<td><span class="status-badge" style="background:' + statusColor + '20; color:' + statusColor + '">' + escapeHtml(f.status) + '</span></td>' +
                '<td>' + escapeHtml(displayProject) + '</td>' +
                '<td>' + escapeHtml(f.pools || '') + '</td>' +
                '<td><b>' + avgQText + '</b></td>' +
            '</tr>';
        }
        tbody.innerHTML = html;
    }

    function triggerFilterUpdate() {
        applyFilters();
        updateKPI();
        buildQualityChart();
        buildErrorChart();
        buildPoolQualityChart();
        buildDayQualityChart();
        buildErrorsByMarkerChart();
        buildTrendChart();
        buildTable();
        renderFeedbackTableHome();
    }

    // ===== Переключение табов проекта =====
    function switchTab(tabId, btn) {
        currentTab = tabId;
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        triggerFilterUpdate();
    }

    // ===== Multi-select =====
    function toggleDropdown(id) {
        var dropdown = document.getElementById(id + '_dropdown');
        if (!dropdown) return;
        var isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.ms-dropdown').forEach(function (d) { d.classList.remove('open'); });
        if (!isOpen) {
            dropdown.classList.add('open');
            var searchInput = dropdown.querySelector('.ms-search');
            if (searchInput) {
                searchInput.value = '';
                filterMsOptions(searchInput);
                setTimeout(function () { searchInput.focus(); }, 50);
            }
        }
    }

    function filterMsOptions(inputEl) {
        var dropdown = inputEl.closest('.ms-dropdown');
        if (!dropdown) return;
        var items = dropdown.querySelectorAll('.ms-item');
        var query = inputEl.value.toLowerCase();
        for (var i = 0; i < items.length; i++) {
            if (items[i].classList.contains('ms-all')) continue;
            items[i].style.display = items[i].textContent.toLowerCase().indexOf(query) >= 0 ? 'flex' : 'none';
        }
    }

    function updateLabel(containerId, stateKey) {
        var label = document.getElementById(containerId + '_label');
        if (!label) return;
        var count = filterState[stateKey].size;
        if (count === 0) {
            label.textContent = stateKey === 'pool' ? 'Все пулы' : 'Все';
            label.classList.add('empty');
        } else if (count === 1) {
            label.textContent = Array.from(filterState[stateKey])[0];
            label.classList.remove('empty');
        } else {
            label.textContent = 'Выбрано: ' + count;
            label.classList.remove('empty');
        }
    }

    function toggleAll(containerId, stateKey) {
        var allCheckbox = document.getElementById(containerId + '_all');
        var checkboxes = document.querySelectorAll('#' + containerId + '_options input[type="checkbox"]');
        filterState[stateKey].clear();
        for (var i = 0; i < checkboxes.length; i++) {
            checkboxes[i].checked = allCheckbox.checked;
            if (checkboxes[i].checked) filterState[stateKey].add(checkboxes[i].value);
        }
        updateLabel(containerId, stateKey);
        triggerFilterUpdate();
    }

    function onOptionChange(containerId, stateKey, value, isChecked) {
        if (isChecked) filterState[stateKey].add(value);
        else filterState[stateKey].delete(value);

        var allCheckbox = document.getElementById(containerId + '_all');
        var checkboxes = document.querySelectorAll('#' + containerId + '_options input[type="checkbox"]');
        var allChecked = checkboxes.length > 0;
        for (var i = 0; i < checkboxes.length; i++) {
            if (!checkboxes[i].checked) { allChecked = false; break; }
        }
        allCheckbox.checked = allChecked;

        updateLabel(containerId, stateKey);
        triggerFilterUpdate();
    }

    function populateMultiSelect(containerId, stateKey, values) {
        var optionsContainer = document.getElementById(containerId + '_options');
        if (!optionsContainer) return;
        filterState[stateKey].clear();
        document.getElementById(containerId + '_all').checked = false;

        var html = '';
        for (var i = 0; i < values.length; i++) {
            var safe = escapeHtml(values[i]);
            html += '<label class="ms-item">' +
                '<input type="checkbox" value="' + safe + '" onchange="onOptionChange(\'' + containerId + '\', \'' + stateKey + '\', this.value, this.checked)">' +
                '<span style="word-break: break-word;" title="' + safe + '">' + safe + '</span>' +
            '</label>';
        }
        optionsContainer.innerHTML = html;
        updateLabel(containerId, stateKey);
    }

    // ===== Сброс =====
    function resetFilters() {
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';

        ['msPool', 'msMarker', 'msResult'].forEach(function (id) {
            var all = document.getElementById(id + '_all');
            if (all) all.checked = false;
            var cbs = document.querySelectorAll('#' + id + '_options input');
            for (var i = 0; i < cbs.length; i++) cbs[i].checked = false;
        });

        filterState.pool.clear();
        filterState.marker.clear();
        filterState.result.clear();
        updateLabel('msPool', 'pool');
        updateLabel('msMarker', 'marker');
        updateLabel('msResult', 'result');
        triggerFilterUpdate();
    }

    // ===== Экспорт в window для inline-обработчиков =====
    window.switchTab = switchTab;
    window.toggleDropdown = toggleDropdown;
    window.filterMsOptions = filterMsOptions;
    window.toggleAll = toggleAll;
    window.onOptionChange = onOptionChange;
    window.resetFilters = resetFilters;

    // ===== Инициализация =====
    function init() {
        var poolsSet = new Set();
        var markersSet = new Set();
        for (var i = 0; i < processedData.length; i++) {
            if (processedData[i].pool) poolsSet.add(processedData[i].pool);
            if (processedData[i].marker) markersSet.add(processedData[i].marker);
        }
        var pools = Array.from(poolsSet).sort();
        var markers = Array.from(markersSet).sort();

        populateMultiSelect('msPool', 'pool', pools);
        populateMultiSelect('msMarker', 'marker', markers);
        populateMultiSelect('msResult', 'result', ['Ошибка', 'Рекомендация', 'Ошибки не выявлены']);

        document.getElementById('filterDateFrom').addEventListener('change', triggerFilterUpdate);
        document.getElementById('filterDateTo').addEventListener('change', triggerFilterUpdate);
        document.getElementById('btnResetFilters').addEventListener('click', resetFilters);

        document.addEventListener('click', function (e) {
            if (!e.target.closest('.multi-select')) {
                document.querySelectorAll('.ms-dropdown').forEach(function (d) { d.classList.remove('open'); });
            }
        });

        var tabsContainer = document.getElementById('projectTabs');
        if (tabsContainer) {
            tabsContainer.addEventListener('click', function (e) {
                var tabEl = e.target.closest('.tab');
                if (!tabEl) return;
                switchTab(tabEl.dataset.tab, tabEl);
            });
        }

        triggerFilterUpdate();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

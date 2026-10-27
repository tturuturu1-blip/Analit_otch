// js/report-runtime.js — ФИНАЛЬНАЯ ВЕРСИЯ (9 KPI, правильные графики, 8 строк)

(function () {
    'use strict';

    var REPORT_DATA = JSON.parse(document.getElementById('report-data').textContent);
    var processedData = REPORT_DATA.processedData || [];
    var feedbackData = REPORT_DATA.feedbackData || [];
    var targetQualityGlobal = REPORT_DATA.targetQuality || null;
    var supersetTable1 = REPORT_DATA.supersetTable1 || [];

    var ITEMS_PER_PAGE = 10;
    var MAIN_ITEMS_PER_PAGE = 8;
    var currentPage = 1;
    var currentPageFb = 1;

    var filteredData = [];
    var filteredFeedback = [];
    var charts = {};
    var currentTab = 'all';
    var filterState = { pool: new Set(), marker: new Set(), result: new Set() };

    // Плагин подписей для графиков
    var dataLabelsPlugin = {
        id: 'dataLabels',
        afterDatasetsDraw: function(chart) {
            var ctx = chart.ctx;
            ctx.save();
            chart.data.datasets.forEach(function(dataset, i) {
                var meta = chart.getDatasetMeta(i);
                if (!meta.hidden && dataset.showLabels !== false && meta.type === 'bar') {
                    meta.data.forEach(function(element, index) {
                        var val = dataset.data[index];
                        if (val != null && val !== 0 && typeof val === 'number') {
                            var height = element.base - element.y;
                            if (height < 15) return;
                            
                            ctx.fillStyle = '#1f1f1f';
                            ctx.font = 'bold 11px sans-serif';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            
                            var displayVal = dataset.isPercentage ? Number(val).toFixed(1) + '%' : val;
                            ctx.fillText(displayVal, element.x, element.y + (height / 2));
                        }
                    });
                }
            });
            ctx.restore();
        }
    };
    Chart.register(dataLabelsPlugin);

    function formatDate(d) {
        if (!d) return '';
        if (typeof d === 'string' && /^\d{2}\.\d{2}\.\d{2}$/.test(d)) {
            return d;
        }
        var dt = (d instanceof Date) ? d : new Date(d);
        if (isNaN(dt.getTime())) return '';
        return String(dt.getDate()).padStart(2, '0') + '.' +
               String(dt.getMonth() + 1).padStart(2, '0') + '.' + String(dt.getFullYear()).slice(-2);
    }

    function parseDate(str) {
        if (!str) return null;
        if (str instanceof Date) return str;
        var s = String(str).trim();
        var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        if (m) {
            var year = parseInt(m[3], 10);
            if (year < 100) year += 2000;
            return new Date(year, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
        }
        m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        var d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
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

    function getValidationLink(r) {
        if (r.url) {
            return '<a href="' + escapeHtml(r.url) + '" target="_blank" class="badge-link">Перейти</a>';
        }
        if (r._type === 'validation' && r.orgId && r.assignmentId && r.itemId) {
            var constructedUrl = 'https://tagme.sberdevices.ru/company/' + r.orgId + '/assignment/' + r.assignmentId + '/reel?size=10&page=1&item=' + r.itemId;
            return '<a href="' + escapeHtml(constructedUrl) + '" target="_blank" class="badge-link">Перейти</a>';
        }
        return '—';
    }

    function matchesTab(r) {
        if (currentTab === 'all') return true;
        var project = (r.project || '').trim();
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
                var rDateFrom = parseDate(r.date);
                if (rDateFrom && rDateFrom < fromDate) return false;
            }
            if (toDate && r.date) {
                var rDateTo = parseDate(r.date);
                if (rDateTo && rDateTo >= toDate) return false;
            }
            return true;
        });

        var validMarkers = new Set();
        if (currentTab !== 'all') {
            for (var i = 0; i < processedData.length; i++) {
                if (matchesTab(processedData[i])) validMarkers.add(processedData[i].marker);
            }
        }

        filteredFeedback = feedbackData.filter(function (f) {
            if (currentTab === 'all') return true;
            return validMarkers.has(f.marker);
        }).sort(function (a, b) {
            var dA = parseDate(a.date);
            var dB = parseDate(b.date);
            if (!dA && !dB) return 0;
            if (!dA) return 1;
            if (!dB) return -1;
            return dB - dA;
        });
    }

    function updateKPI() {
        var uniqueFiles = new Set();
        var totalFragments = 0;

        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (r._type !== 'validation') continue;
            var fileKey = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '') + '|' + r.fragments;
            if (!uniqueFiles.has(fileKey)) {
                uniqueFiles.add(fileKey);
                totalFragments += (r.fragments || 0);
            }
        }

        var uniqueMarkers = new Set();
        var weightedErrorsCount = 0;
        var qualityKeys = new Set();
        var qualitySum = 0, qualityCount = 0;

        for (var j = 0; j < filteredData.length; j++) {
            var rr = filteredData[j];
            if (rr.marker) uniqueMarkers.add(rr.marker);
            
            if (rr.result === 'Ошибка') {
                var weight = rr.errorType === 'Некритичная ошибка' ? 0.5 : 1;
                weightedErrorsCount += weight;
            }
            
            if (rr.quality != null && isFinite(rr.quality)) {
                var qKey = (rr.marker || '') + '|' + (rr.project || '') + '|' + (rr.pool || '') + '|' + (rr.fileName || '');
                if (!qualityKeys.has(qKey)) {
                    qualityKeys.add(qKey);
                    qualitySum += rr.quality;
                    qualityCount++;
                }
            }
        }

        var errorPercent = totalFragments > 0 ? (weightedErrorsCount / totalFragments) * 100 : 0;
        var avgQ = qualityCount ? qualitySum / qualityCount : null;
        var avgQPct = avgQ !== null ? avgQ * 100 : 0;

        var isRed = (targetQualityGlobal != null) && (errorPercent > 5) && (avgQPct < targetQualityGlobal);
        var isGreen = (targetQualityGlobal != null) && (errorPercent <= 5) && (avgQPct >= targetQualityGlobal);
        var qColorClass = 'val-brown';
        var errColorClass = 'val-brown';

        if (isRed) { qColorClass = 'val-red'; errColorClass = 'val-red'; }
        else if (isGreen) { qColorClass = 'val-green'; errColorClass = 'val-green'; }

        // ★ ИЗМЕНЕНО: Расчет Факт/Цена/Время/Коэффициент на основе фильтров
        var activeTasks = supersetTable1 || [];
        if (currentTab !== 'all') activeTasks = activeTasks.filter(function(t) { return t.project === currentTab; });
        if (filterState.pool.size > 0) activeTasks = activeTasks.filter(function(t) { return filterState.pool.has(t.task); });
        
        if (from || to) {
            activeTasks = activeTasks.filter(function(t) {
                var rowStart = t.dateStart ? parseDate(t.dateStart) : null;
                var rowEnd = t.dateEnd ? parseDate(t.dateEnd) : null;
                if (fromDate && rowEnd && rowEnd < fromDate) return false;
                if (toDate && rowStart && rowStart > toDate) return false;
                return true;
            });
        }

        var parseHtmlNumberToFloat = function(val) {
            if (val == null) return null;
            var s = String(val).trim().replace(/<[^>]*>/g, '').replace(/\./g, ',');
            if (!s) return null;
            var n = parseFloat(s.replace(',', '.'));
            return isNaN(n) ? null : n;
        };
        var parsePriceToFloat = function(val) {
            if (val == null || val === '') return null;
            var s = String(val).replace(/\s+/g, '').replace(',', '.');
            var n = parseFloat(s);
            return isNaN(n) ? null : n;
        };
        var avg = function(arr) { return arr.length ? arr.reduce(function(a,b){return a+b;},0)/arr.length : null; };

        var balls = activeTasks.map(function(r){ return parseHtmlNumberToFloat(r.ballsPerHour); }).filter(function(v){return v!==null;});
        var ballsPerHour = avg(balls);

        var prods = activeTasks.map(function(r){ return parseHtmlNumberToFloat(r.prodPerHour); }).filter(function(v){return v!==null;});
        var prodPerHour = avg(prods);

        var prices = activeTasks.map(function(r){ return parsePriceToFloat(r.price); }).filter(function(v){return v!==null;});
        var avgPrice = avg(prices);

        var timesByTask = {};
        activeTasks.forEach(function(r) {
            var p = parsePriceToFloat(r.price);
            var b = parseHtmlNumberToFloat(r.ballsPerHour);
            if (p === null || p <= 0 || b === null || b <= 0) return;
            var t = (p * 60) / b;
            var key = (r.project || '') + '|' + (r.task || '');
            if (!timesByTask[key]) timesByTask[key] = [];
            timesByTask[key].push(t);
        });
        var taskAverages = Object.values(timesByTask).map(avg).filter(function(a){return a!==null;});
        var avgTime = avg(taskAverages);

        var container = document.getElementById('mainKpisContainer');
        if (!container) return;

        container.innerHTML = 
            '<div class="kpi-card"><div class="label">Целевое качество</div><div class="value val-brown">' + (targetQualityGlobal != null ? targetQualityGlobal.toFixed(1) + '%' : '—') + '</div></div>' +
            '<div class="kpi-card"><div class="label">Качество</div><div class="value ' + qColorClass + '">' + (avgQ !== null ? avgQPct.toFixed(1) + '%' : '—') + '</div></div>' +
            '<div class="kpi-card"><div class="label">Ошибок</div><div class="value ' + errColorClass + '">' + errorPercent.toFixed(2) + '%</div></div>' +
            '<div class="kpi-card"><div class="label">Разметчиков</div><div class="value val-brown">' + uniqueMarkers.size + '</div></div>' +
            '<div class="kpi-card"><div class="label">Норма, у.е./час</div><div class="value val-brown">580</div></div>' + // В отчете норма фиксированная (без истории)
            '<div class="kpi-card"><div class="label">Факт, у.е./час</div><div class="value val-brown">' + (ballsPerHour != null ? ballsPerHour.toFixed(1) : '—') + '</div></div>' +
            '<div class="kpi-card"><div class="label">Стоимость, у.е.</div><div class="value val-brown">' + (avgPrice != null ? avgPrice.toFixed(2) : '—') + '</div></div>' +
            '<div class="kpi-card"><div class="label">Среднее время разметки, мин</div><div class="value val-brown">' + (avgTime != null ? avgTime.toFixed(1) : '—') + '</div></div>' +
            '<div class="kpi-card"><div class="label">Коэффициент</div><div class="value val-brown">' + (prodPerHour != null ? prodPerHour.toFixed(2) : '—') + '</div></div>';
    }

    function destroyChart(k) {
        if (charts[k]) { try { charts[k].destroy(); } catch (e) {} delete charts[k]; }
    }

    function buildQualityChart() {
        destroyChart('quality');
        var byMarker = {};
        var qualityKeys = new Set();
        
        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (r.marker && r.quality != null && isFinite(r.quality)) {
                var key = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
                if (!qualityKeys.has(key)) {
                    qualityKeys.add(key);
                    if (!byMarker[r.marker]) byMarker[r.marker] = [];
                    byMarker[r.marker].push(r.quality);
                }
            }
        }
        
        var labels = Object.keys(byMarker).sort();
        var values = labels.map(function (m) {
            var arr = byMarker[m];
            var sum = 0;
            for (var k = 0; k < arr.length; k++) sum += arr[k];
            return (sum / arr.length) * 100;
        });
        
        var datasets = [
            { label: 'Ср. качество, %', data: values, backgroundColor: '#d4ebd9', borderRadius: 8, order: 2, showLabels: true, isPercentage: true }
        ];
        if (targetQualityGlobal != null) {
            datasets.push({ label: 'Целевое', data: Array(labels.length).fill(targetQualityGlobal), type: 'line', borderDash: [5, 5], borderColor: '#1f1f1f', borderWidth: 2, pointRadius: 0, order: 1 });
        }

        charts.quality = new Chart(document.getElementById('chartQuality'), {
            type: 'bar',
            data: { labels: labels.map(function (l) { return l.length > 25 ? l.slice(0, 22) + '…' : l; }), datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#6b4d38' } } },
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: function (v) { return v + '%'; }, color: '#6b4d38' } },
                    x: { ticks: { color: '#6b4d38' } }
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
                datasets: [{ data: Object.keys(byType).map(function (k) { return byType[k]; }), backgroundColor: ['#85c4ae', '#f07171', '#f2c94c', '#6b4d38', '#a39081', '#fce8e8'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { color: '#6b4d38' } }, dataLabels: { showLabels: false } } }
        });
    }

    function buildPoolQualityChart() {
        destroyChart('poolQuality');
        var byPool = {};
        var qualityKeys = new Set();
        
        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (r.pool && r.quality != null && isFinite(r.quality)) {
                var key = (r.pool || '') + '|' + (r.marker || '') + '|' + (r.project || '') + '|' + (r.fileName || '');
                if (!qualityKeys.has(key)) {
                    qualityKeys.add(key);
                    if (!byPool[r.pool]) byPool[r.pool] = [];
                    byPool[r.pool].push(r.quality);
                }
            }
        }
        
        var labels = Object.keys(byPool).sort();
        var values = labels.map(function (p) {
            var arr = byPool[p];
            var sum = 0;
            for (var k = 0; k < arr.length; k++) sum += arr[k];
            return (sum / arr.length) * 100;
        });
        
        var datasets = [
            { label: 'Ср. качество, %', data: values, borderColor: '#85c4ae', backgroundColor: 'rgba(133, 196, 174, 0.1)', tension: .3, fill: true, pointRadius: 4, order: 2 }
        ];
        if (targetQualityGlobal != null) {
            datasets.push({ label: 'Целевое', data: labels.map(function() { return targetQualityGlobal; }), borderColor: '#f07171', borderDash: [5, 5], borderWidth: 2, pointRadius: 0, order: 1 });
        }

        charts.poolQuality = new Chart(document.getElementById('chartPoolQuality'), {
            type: 'line',
            data: { labels: labels.map(function (l) { return l.length > 30 ? l.slice(0, 27) + '…' : l; }), datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#6b4d38' } } },
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: function (v) { return v + '%'; }, color: '#6b4d38' } },
                    x: { ticks: { color: '#6b4d38' } }
                }
            }
        });
    }

    function buildDayQualityChart() {
        destroyChart('dayQuality');
        var byDate = {};
        var qualityKeys = new Set();
        
        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            if (r.date && r.quality != null && isFinite(r.quality)) {
                var k = formatDate(r.date);
                var key = k + '|' + (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
                if (!qualityKeys.has(key)) {
                    qualityKeys.add(key);
                    if (!byDate[k]) byDate[k] = [];
                    byDate[k].push(r.quality);
                }
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

        var datasets = [
            { label: 'Ср. качество, %', data: values, borderColor: '#85c4ae', backgroundColor: 'rgba(133, 196, 174, 0.1)', tension: .3, fill: true, pointRadius: 4, order: 2 }
        ];
        if (targetQualityGlobal != null) {
            datasets.push({ label: 'Целевое', data: labels.map(function() { return targetQualityGlobal; }), borderColor: '#f07171', borderDash: [5, 5], borderWidth: 2, pointRadius: 0, order: 1 });
        }

        charts.dayQuality = new Chart(document.getElementById('chartDayQuality'), {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#6b4d38' } } },
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: function (v) { return v + '%'; }, color: '#6b4d38' } },
                    x: { ticks: { color: '#6b4d38' } }
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
        var colors = ['#85c4ae', '#f07171', '#f2c94c', '#6b4d38', '#a39081', '#fce8e8'];

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
                plugins: { legend: { position: 'bottom', labels: { color: '#6b4d38' } } },
                scales: {
                    x: { stacked: true, ticks: { color: '#6b4d38' } },
                    y: { stacked: true, beginAtZero: true, ticks: { color: '#6b4d38' } }
                }
            }
        });
    }

    function changePage(tableKey, page) {
        if (tableKey === 'main') currentPage = page;
        else if (tableKey === 'fb') currentPageFb = page;
        buildTable();
        renderFeedbackTableHome();
    }

    function renderPaginationControls(controlsId, infoId, totalItems, currentPage, tableKey, limit) {
        var container = document.getElementById(controlsId);
        var info = document.getElementById(infoId);
        if (!container || !info) return;

        var totalPages = Math.ceil(totalItems / limit) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        var start = totalItems === 0 ? 0 : (currentPage - 1) * limit + 1;
        var end = Math.min(currentPage * limit, totalItems);
        info.textContent = totalItems === 0 ? 'Показано 0 из 0' : 'Показано ' + start + '-' + end + ' из ' + totalItems;

        var html = '';
        html += '<button class="page-btn" ' + (currentPage === 1 ? 'disabled' : '') + ' onclick="changePage(\'' + tableKey + '\', ' + (currentPage - 1) + ')">&lt;</button>';
        
        for (var i = 1; i <= totalPages; i++) {
            if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - currentPage) > 1) {
                if (i === 3) html += '<span style="padding: 0 5px; color: var(--muted); align-self: center;">...</span>';
                continue;
            }
            html += '<button class="page-btn ' + (currentPage === i ? 'active' : '') + '" onclick="changePage(\'' + tableKey + '\', ' + i + ')">' + i + '</button>';
        }
        
        html += '<button class="page-btn" ' + (currentPage === totalPages ? 'disabled' : '') + ' onclick="changePage(\'' + tableKey + '\', ' + (currentPage + 1) + ')">&gt;</button>';
        container.innerHTML = html;
    }

    function buildTable() {
        var tbody = document.getElementById('tableBody');
        if (!tbody) return;

        var groups = {};
        for (var i = 0; i < filteredData.length; i++) {
            var r = filteredData[i];
            var key = (r.marker || '') + '|' + (r.project || '') + '|' + (r.pool || '') + '|' + (r.fileName || '');
            if (!groups[key]) {
                groups[key] = {
                    date: r.date, project: r.project, pool: r.pool, marker: r.marker, fileName: r.fileName,
                    quality: r.quality, fragments: r.fragments, url: r.url, orgId: r.orgId, assignmentId: r.assignmentId, itemId: r.itemId,
                    _type: r._type, _linked: r._linked, items: []
                };
            }
            if (r.result === 'Ошибка' || r.result === 'Рекомендация') {
                groups[key].items.push({ result: r.result, errorType: r.errorType, comment: r.comment, interval: r.interval });
            } else if (r.result === 'Ошибки не выявлены' && groups[key].items.length === 0) {
                groups[key].items.push({ result: r.result, errorType: r.errorType, comment: r.comment, interval: r.interval });
            }
        }

        var groupedArray = Object.values(groups);
        groupedArray.sort(function(a, b) {
            var dA = parseDate(a.date);
            var dB = parseDate(b.date);
            if (!dA && !dB) return 0;
            if (!dA) return 1;
            if (!dB) return -1;
            return dB - dA;
        });

        var totalItems = groupedArray.length;
        var startIndex = (currentPage - 1) * MAIN_ITEMS_PER_PAGE;
        var endIndex = Math.min(startIndex + MAIN_ITEMS_PER_PAGE, totalItems);
        var rows = groupedArray.slice(startIndex, endIndex);

        var html = '';
        for (var k = 0; k < rows.length; k++) {
            var g = rows[k];
            var valLink = getValidationLink(g);
            var fileName = g.fileName ? escapeHtml(g.fileName.slice(0, 40)) : '';
            var fileNameTitle = escapeHtml(g.fileName || '');
            var quality = (g.quality !== null && !isNaN(g.quality)) ? (g.quality * 100).toFixed(1) + '%' : '';

            var itemsHtml = '<div class="items-grid">';
            for (var m = 0; m < g.items.length; m++) {
                var item = g.items[m];
                var badgeClass = item.result === 'Ошибка' ? 'badge-error' : item.result === 'Рекомендация' ? 'badge-rec' : 'badge-ok';
                var resBadge = '<span class="badge ' + badgeClass + '">' + escapeHtml(item.result || '') + '</span>';
                var errType = escapeHtml(item.errorType || '');
                var comment = item.comment ? escapeHtml(item.comment.slice(0, 100)) : '';
                var commentTitle = item.comment ? escapeHtml(item.comment) : '';
                var interval = escapeHtml(item.interval || '');

                itemsHtml += '<div class="item-row">' +
                    '<div>' + resBadge + '</div>' +
                    '<div>' + errType + '</div>' +
                    '<div' + (commentTitle ? ' title="' + commentTitle + '"' : '') + '>' + comment + '</div>' +
                    '<div>' + interval + '</div>' +
                '</div>';
            }
            itemsHtml += '</div>';

            html += '<tr>' +
                '<td>' + (g.date ? formatDate(g.date) : '') + '</td>' +
                '<td>' + escapeHtml((g.project || '').replace(/_validate$/, '')) + '</td>' +
                '<td>' + escapeHtml(g.pool || '') + '</td>' +
                '<td>' + escapeHtml(g.marker || '') + '</td>' +
                '<td title="' + fileNameTitle + '">' + fileName + '</td>' +
                '<td colspan="4" style="padding: 0;">' + itemsHtml + '</td>' +
                '<td>' + quality + '</td>' +
                '<td>' + valLink + '</td>' +
            '</tr>';
        }
        tbody.innerHTML = html;

        renderPaginationControls('pagination-data-controls', 'pagination-data-info', totalItems, currentPage, 'main', MAIN_ITEMS_PER_PAGE);
    }

    function renderFeedbackTableHome() {
        var tbody = document.getElementById('fbTableBodyHome');
        if (!tbody) return;

        var totalItems = filteredFeedback.length;
        var startIndex = (currentPageFb - 1) * ITEMS_PER_PAGE;
        var endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
        var rows = filteredFeedback.slice(startIndex, endIndex);

        var html = '';
        for (var j = 0; j < rows.length; j++) {
            var f = rows[j];
            var statusColor = f.status === 'Проведена' ? '#85c4ae' : f.status === 'Отменена' ? '#e55555' : f.status === 'Перенесена' ? '#f2c94c' : '#7a95b8';
            var avgQText = (f.avgQuality !== undefined && f.avgQuality !== null) ? (f.avgQuality * 100).toFixed(1) + '%' : '—';
            var displayProject = f.project || '—';
            html += '<tr>' +
                '<td>' + escapeHtml(formatDate(f.date)) + '</td>' +
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

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--muted); padding: 20px;">Нет данных.</td></tr>';
        }

        renderPaginationControls('pagination-fbHome-controls', 'pagination-fbHome-info', totalItems, currentPageFb, 'fb', ITEMS_PER_PAGE);
    }

    function triggerFilterUpdate() {
        currentPage = 1;
        currentPageFb = 1;
        applyFilters();
        updateKPI();
        buildQualityChart();
        buildErrorChart();
        buildPoolQualityChart();
        buildDayQualityChart();
        buildErrorsByMarkerChart();
        buildTable();
        renderFeedbackTableHome();
    }

    function switchTab(tabId, btn) {
        currentTab = tabId;
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        triggerFilterUpdate();
    }

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

    window.switchTab = switchTab;
    window.toggleDropdown = toggleDropdown;
    window.filterMsOptions = filterMsOptions;
    window.toggleAll = toggleAll;
    window.onOptionChange = onOptionChange;
    window.resetFilters = resetFilters;
    window.changePage = changePage;

    function init() {
        var projectNames = [];
        var seenProjects = {};
        for (var pi = 0; pi < processedData.length; pi++) {
            var pName = (processedData[pi].project || '').replace(/_validate$/, '').trim();
            if (pName && !seenProjects[pName]) {
                seenProjects[pName] = true;
                projectNames.push(pName);
            }
        }

        var dateStr = formatDate(new Date());

        function quoteNames(names) {
            return names.map(function(n) { return '«' + n + '»'; }).join(', ');
        }

        var fullTitle, accentText, proText;
        if (projectNames.length === 0) {
            fullTitle = 'Отчёт (обн. ' + dateStr + ')';
            accentText = 'Отчёт';
            proText = 'обн. ' + dateStr;
        } else if (projectNames.length === 1) {
            fullTitle = 'Отчёт по проекту ' + quoteNames(projectNames) + ' (обн. ' + dateStr + ')';
            accentText = 'Отчёт по проекту';
            proText = quoteNames(projectNames) + ' · обн. ' + dateStr;
        } else {
            var shownNames = projectNames.slice(0, 3);
            var moreText = projectNames.length > 3 ? ' и др.' : '';
            var namesJoined = quoteNames(shownNames) + moreText;
            fullTitle = 'Отчёт по проектам ' + namesJoined + ' (обн. ' + dateStr + ')';
            accentText = 'Отчёт по проектам';
            proText = namesJoined + ' · обн. ' + dateStr;
        }

        document.title = fullTitle;
        var brandEl = document.querySelector('.brand');
        if (brandEl) {
            brandEl.innerHTML = '<span class="brand-accent">' + escapeHtml(accentText) + '</span> <span class="brand-pro">' + escapeHtml(proText) + '</span>';
        }

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

import { state, saveToStorage } from './state.js';
import {
    parseExcelDate, getVal, stripJson, formatInterval,
    detectTableType, updateProgress, log, yieldToUI
} from './utils.js';

// ===== Чтение Excel =====
function readOneExcelFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array', cellDates: true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(ws, { defval: null });
                resolve({ ok: true, file: file.name, rows: json });
            } catch (err) { resolve({ ok: false, file: file.name, error: err.message }); }
        };
        reader.onerror = () => resolve({ ok: false, file: file.name, error: 'FileReader error' });
        reader.readAsArrayBuffer(file);
    });
}

export async function readExcelFiles(files) {
    const results = [];
    for (let i = 0; i < files.length; i++) {
        const pct = (i / files.length) * 100;
        updateProgress(pct, 'Чтение: ' + files[i].name, 'Чтение файлов');
        await yieldToUI();
        const r = await readOneExcelFile(files[i]);
        if (r.ok) log('✓ ' + r.file + ' — прочитан');
        else log('✗ ' + r.file + ' — ошибка: ' + r.error, true);
        results.push(r);
    }
    return results.filter(r => r.ok);
}

export async function processNewRows(results) {
    let addedM = 0, addedV = 0, addedR = 0;
    for (const { rows } of results) {
        for (const row of rows) {
            if (Object.values(row).filter(v => v !== null && v !== '').length < 2) continue;
            const type = detectTableType(row);
            if (type === 'markers') { state.rawMarkers.push(row); addedM++; }
            else if (type === 'validation') { state.rawValidation.push(row); addedV++; }
            else if (type === 'recommendations') { state.rawRecommendations.push(row); addedR++; }
        }
    }
    log(`Добавлено: Markers (${addedM}), Валидация (${addedV}), Рекомендации (${addedR})`);
    saveToStorage();
    await recomputeDashboard();
}

// ===== Основной пересчёт =====
export async function recomputeDashboard() {
    state.processedData = [];
    updateProgress(10, 'Построение словаря разметчиков...', 'Пересчет');
    await yieldToUI();

    const markerDict = {};
    for (const m of state.rawMarkers) {
        if (!m || typeof m !== 'object') continue;
        const taskStr = getVal(m, 'Задача');
        let pool = null, marker = null;
        if (taskStr) {
            const parts = taskStr.split('Гимнастки август_');
            if (parts.length > 1) {
                const subParts = parts[1].split('_validate_');
                pool = subParts[0] || null;
                marker = subParts[1] || null;
            }
        }
        const taskId = getVal(m, 'ID задачи');
        const markerId = getVal(m, 'ID разметчика');
        const project = getVal(m, 'Проект');
        if (taskId && markerId) {
            markerDict[`${taskId}|${markerId}`] = {
                pool, marker, validator: getVal(m, 'Email'), project
            };
        }
    }

    updateProgress(30, 'Обработка исправлений...', 'Пересчет');
    await yieldToUI();

    const valDict = {};
    for (const v of state.rawValidation) {
        if (!v) continue;
        const aid = getVal(v, 'assignment_id');
        if (aid) valDict[aid] = v;
    }
    const childrenToRemove = new Set();
    for (const v of state.rawValidation) {
        if (!v) continue;
        const origId = getVal(v, 'original_assignment_id');
        if (origId && origId !== '') {
            const parent = valDict[origId];
            if (parent) parent['OUTPUT:marks'] = v['OUTPUT:marks'];
            childrenToRemove.add(v);
        }
    }
    const validValidations = state.rawValidation.filter(v => v && !childrenToRemove.has(v));

    updateProgress(50, 'Парсинг JSON...', 'Пересчет');
    await yieldToUI();

    for (const v of validValidations) {
        const taskId = getVal(v, 'task_id');
        const markerId = getVal(v, 'marker_id');
        const fileName = stripJson(getVal(v, 'file_name', 'Наименование файла'));
        const date = parseExcelDate(getVal(v, 'start_date', 'Дата валидации'));
        const mInfo = markerDict[`${taskId}|${markerId}`] || { pool: null, marker: null, validator: null, project: null };

        const jsonStr = getVal(v, 'OUTPUT:marks');
        let totalFragments = 0, mistakes = [];

        if (jsonStr) {
            try {
                const data = JSON.parse(jsonStr);
                if (Array.isArray(data)) {
                    const segments = data.filter(d => d.type === 'segment');
                    totalFragments = segments.filter(d => d.entityId !== 'mistake').length;
                    mistakes = segments.filter(d => d.entityId === 'mistake').map(m => {
                        const typ = m.fields?.radio?.value || 'Неизвестная ошибка';
                        const comm = m.fields?.comment?.value || '';
                        const weight = typ === 'Некритичная ошибка' ? 0.5 : 1;
                        return { typ, comm, weight, interval: formatInterval(m.position?.start, m.position?.finish) };
                    });
                }
            } catch (e) { /* пропускаем битые записи */ }
        }

        const sumWeights = mistakes.reduce((a, b) => a + b.weight, 0);
        const quality = (totalFragments === 0 || mistakes.length === 0) ? 1 : 1 - (sumWeights / totalFragments);

        if (mistakes.length === 0) {
            state.processedData.push({
                _id: 'v_' + Math.random().toString(36).slice(2, 9),
                _type: 'validation', _linked: null,
                date, pool: mInfo.pool, marker: mInfo.marker, validator: mInfo.validator, project: mInfo.project,
                fileName, result: 'Ошибки не выявлены', errorType: null, comment: null,
                quality: 1, interval: null, fragments: totalFragments
            });
        } else {
            for (const mis of mistakes) {
                state.processedData.push({
                    _id: 'v_' + Math.random().toString(36).slice(2, 9),
                    _type: 'validation', _linked: null,
                    date, pool: mInfo.pool, marker: mInfo.marker, validator: mInfo.validator, project: mInfo.project,
                    fileName, result: 'Ошибка', errorType: mis.typ, comment: mis.comm,
                    quality, interval: mis.interval, fragments: totalFragments
                });
            }
        }
    }

    updateProgress(80, 'Обработка рекомендаций...', 'Пересчет');
    await yieldToUI();

    for (const r of state.rawRecommendations) {
        if (!r) continue;
        state.processedData.push({
            _id: 'r_' + Math.random().toString(36).slice(2, 9),
            _type: 'recommendations', _linked: null,
            date: parseExcelDate(getVal(r, 'Дата валидации')),
            pool: getVal(r, 'Пул'),
            marker: getVal(r, 'Почта разметчика'),
            validator: getVal(r, 'Почта валидатора'),
            fileName: stripJson(getVal(r, 'Наименование файла')),
            result: 'Рекомендация', errorType: null,
            comment: getVal(r, 'Комментарий'),
            quality: null,
            interval: getVal(r, 'Временной интервал фрагмента'),
            fragments: 0
        });
    }

    updateProgress(90, 'Связывание...', 'Пересчет');
    await yieldToUI();

    const valIndex = {};
    for (const v of state.processedData) {
        if (v._type === 'validation') {
            const key = `${v.pool || ''}|${v.marker || ''}|${v.validator || ''}|${v.fileName || ''}`;
            if (!valIndex[key]) valIndex[key] = v;
        }
    }
    for (const r of state.processedData) {
        if (r._type === 'recommendations') {
            const key = `${r.pool || ''}|${r.marker || ''}|${r.validator || ''}|${r.fileName || ''}`;
            if (valIndex[key]) {
                r._linked = valIndex[key]._id;
                r.quality = valIndex[key].quality;
            }
        }
    }

    updateProgress(100, 'Готово', 'Пересчет');

    // Сообщаем UI, что данные обновлены — app.js обновит всё
    window.dispatchEvent(new CustomEvent('app:data-updated'));
}

// ===== Фильтрация =====
export function matchesTab(r) {
    if (state.currentTab === 'all') return true;
    if (state.currentTab === 'aug' && (r.project || '') !== 'Гимнастки август_validate') return false;
    if (state.currentTab === 'prep' && (r.project || '') !== 'Гимнастика. Подготовка выступлений_validate') return false;
    if (state.currentTab === 'prop' && (r.project || '') !== 'Гимнастки разметка с предметом_validate') return false;
    return true;
}

export function applyFilters() {
    const from = document.getElementById('filterDateFrom').value;
    const to = document.getElementById('filterDateTo').value;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (toDate) toDate.setDate(toDate.getDate() + 1);

    // Предварительно кэшируем Set — доступ к Set быстрее, чем к state
    const { pool, marker, result } = state.filterState;
    const poolEmpty = pool.size === 0;
    const markerEmpty = marker.size === 0;
    const resultEmpty = result.size === 0;

    state.filteredData = state.processedData.filter(r => {
        if (!matchesTab(r)) return false;
        if (!poolEmpty && !pool.has(r.pool || '')) return false;
        if (!markerEmpty && !marker.has(r.marker || '')) return false;
        if (!resultEmpty && !result.has(r.result || '')) return false;
        if (fromDate && r.date && r.date < fromDate) return false;
        if (toDate && r.date && r.date >= toDate) return false;
        return true;
    });
}
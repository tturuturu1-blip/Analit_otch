// js/utils.js — ИЗМЕНЕНИЕ ФОРМАТА ДАТЫ НА ДД.ММ.ГГ
// ★ ДОБАВЛЕНО: getValidationUrl принимает domain параметром (без fallback),
//    updateLabel поддерживает 'tasks' (для галочки «Выбрать все» в #msSupersetTask)

import { state } from './state.js';

// ===== Ссылка на валидацию =====
// ★ ИЗМЕНЕНО: домен передаётся параметром (привязка к записи через _domain в data.js/ui.js).
//              Пустой domain → null (ссылка не собирается). Никаких fallback.
export function getValidationUrl(orgId, assignmentId, itemId, domain) {
    if (!orgId || !assignmentId || !itemId) return null;
    if (!domain) return null;
    const base = String(domain).trim().replace(/\/+$/, '');
    if (!base) return null;
    return `${base}/company/${orgId}/assignment/${assignmentId}/reel?size=10&page=1&item=${itemId}`;
}

// ===== Даты и данные =====
export function parseExcelDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000);
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(new Date(s).getTime()) ? null : new Date(s);
}

// ★ ИЗМЕНЕНО: формат даты теперь дд.мм.гг
export function formatDate(d) {
    if (!d) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2); // Обрезаем до 2 последних цифр
    return day + '.' + month + '.' + year;
}

export function getVal(row, ...names) {
    if (!row) return null;
    for (const n of names) {
        if (row[n] !== undefined && row[n] !== null && row[n] !== '') return row[n];
        const found = Object.keys(row).find(k => k.toLowerCase().trim() === n.toLowerCase().trim());
        if (found && row[found] !== undefined && row[found] !== null && row[found] !== '') return row[found];
    }
    return null;
}

export function stripJson(str) {
    return str ? String(str).replace(/\.json$/i, '') : str;
}

export function formatInterval(start, finish) {
    if (start == null || finish == null) return null;
    const fmt = (val) => {
        const totalMs = Math.round(val * 1000);
        const mins = Math.floor(totalMs / 60000);
        const rem = totalMs - mins * 60000;
        const secs = Math.floor(rem / 1000);
        const ms = rem - secs * 1000;
        return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };
    return `${fmt(start)}-${fmt(finish)}`;
}

export function parseHtmlNumber(val) {
    if (val == null) return '';
    let s = String(val).trim();
    if (!s) return '';
    if (s.indexOf('<') >= 0) {
        s = s.replace(/<[^>]*>/g, '').trim();
    }
    s = s.replace(/\./g, ',');
    return s;
}

export function parseNorm(val) {
    if (val == null) return null;
    let s = String(val).trim().replace(',', '.').replace('%', '').replace(/\s+/g, '');
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    return n < 1 ? n * 100 : n;
}

export function detectTableType(row) {
    const keys = Object.keys(row).map(k => k.toLowerCase().trim());

    if (keys.includes('фио') && (keys.includes('почта') || keys.includes('email'))
        && !keys.includes('норматив') && !keys.includes('проект') && !keys.includes('задача')
        && !keys.includes('дата')) {
        return 'employee_map';
    }

    if (keys.includes('фио') && (keys.includes('норматив') || keys.includes('размечено б') || keys.includes('размечено, б'))) {
        return 'superset3';
    }
    if (keys.includes('норма качества') || keys.includes('ханипотов или заданий с качеством') || keys.includes('источник качества')) {
        return 'superset2';
    }
    if (keys.includes('заказчик') || keys.includes('факт баллов/час') || keys.includes('кпроизв в час') || keys.includes('медиана проекта')) {
        return 'superset1';
    }
    if (keys.includes('url задания') && keys.includes('file_name') && keys.includes('меток с учетом предразметки')) {
        return 'validation_flat';
    }
    if (keys.includes('assignment_id') || keys.includes('output:marks') || keys.includes('output_marks')) return 'validation';
    if (keys.includes('id разметчика') || keys.includes('id задачи')) return 'markers';
    if (keys.includes('комментарий') && (keys.includes('почта разметчика') || keys.includes('пул'))) return 'recommendations';
    return 'unknown';
}

// ===== Шифрование почты =====
export function maskEmail(email) {
    if (!email || typeof email !== 'string') return email;
    if (email.length <= 12) return email;
    return email.substring(0, 5) + "***" + email.slice(-7);
}

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ★ ИЗМЕНЕНО: поддержка 'tasks' (задачи Суперсета хранятся в state.superset.filters.tasks)
export function updateLabel(containerId, stateKey) {
    const label = document.getElementById(containerId + '_label');
    if (!label) return;
    const setRef = stateKey === 'tasks'
        ? state.superset.filters.tasks
        : state.filterState[stateKey];
    if (!setRef) return;
    const count = setRef.size;
    if (count === 0) {
        label.textContent = (stateKey === 'pool' || stateKey === 'feedbackPool' || stateKey === 'fbFormPools') ? 'Все пулы' : 'Все';
        label.classList.add('empty');
    } else if (count === 1) {
        label.textContent = Array.from(setRef)[0];
        label.classList.remove('empty');
    } else {
        label.textContent = 'Выбрано: ' + count;
        label.classList.remove('empty');
    }
}

export function updateProgress(percent, stage, title) {
    const fill = document.getElementById('progressFill');
    const pct = document.getElementById('progressPct');
    const stageEl = document.getElementById('progressStage');
    const titleEl = document.getElementById('progressTitle');
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (fill) fill.style.width = clamped + '%';
    if (pct) pct.textContent = clamped + '%';
    if (stage !== undefined && stageEl) stageEl.textContent = stage || '';
    if (title !== undefined && titleEl) titleEl.textContent = title || '';
}

export function yieldToUI() { return new Promise(r => setTimeout(r, 0)); }

export function log(msg, isError) {
    const box = document.getElementById('logBox');
    if (!box) return;
    const div = document.createElement('div');
    div.className = isError ? 'err' : 'ok';
    div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    while (box.children.length > 50) box.removeChild(box.firstChild);
}

export function debounce(fn, delay = 100) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

export function destroyChart(chartRef) {
    if (chartRef) { try { chartRef.destroy(); } catch (e) { /* ignore */ } }
}

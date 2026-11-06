// js/state.js — ОБНОВЛЕНО ДЛЯ НОВОГО ФУНКЦИОНАЛА
// ★ ИЗМЕНЕНО: MAIN_ITEMS_PER_PAGE = 6 (для таблицы результатов).
// ★ ДОБАВЛЕНО: calendarDayOffset (для листания календаря по датам).
// Ранее добавленное: rawRecommendationsManual, validationBaseUrl, domainHistory, pendingNewData, pendingConflicts.

export const STORAGE_KEY = 'validation_dashboard_data_v3';
export const FB_STORAGE_KEY = 'validation_feedback_data_v1';

// Количество строк на одной странице таблицы
export const ITEMS_PER_PAGE = 10;
export const MAIN_ITEMS_PER_PAGE = 6; // ★ ИЗМЕНЕНО: для главной таблицы результатов (теперь 6)

const DEFAULT_NORM_HISTORY = [{ date: '2000-01-01', value: 580 }];

export const state = {
    rawMarkers: [],
    rawValidation: [],
    rawRecommendations: [],
    rawRecommendationsManual: [],   // Рекомендации, введённые вручную через #recTable
    rawFlatValidations: [],
    rawSuperset1: [],
    rawSuperset2: [],
    rawSuperset3: [],
    rawEmployeeMap: [],
    
    // Временные хранилища для логики дубликатов при загрузке
    pendingNewData: null,           
    pendingConflicts: [],           
    
    processedData: [],
    filteredData: [],
    feedbackData: [],
    editingFeedbackIndex: null,     // Индекс редактируемой записи в календаре
    charts: {},
    currentTab: 'all',
    currentMenu: 'main',
    validationBaseUrl: '',   
    domainHistory: [],       
    projects: [],
    
    // ★ НОВОЕ: Смещение дней для календаря (0 = сегодня, -1 = вчера и т.д.)
    calendarDayOffset: 0,

    pagination: {
        mainData: 1,
        fbHome: 1,
        fbTable: 1,
        superset1: 1,
        superset2: 1,
        superset3: 1,
        superset4: 1
    },

    filterState: {
        pool: new Set(),
        marker: new Set(),
        result: new Set(),
        feedbackPool: new Set(),
        feedbackGroup: new Set(),
        fbFormPools: new Set(),
        fbRecordMarkers: new Set()
    },

    feedbackGeneration: {
        appliedPools: new Set(),
        appliedGroups: new Set(),
        videoLinks: {}
    },

    superset: {
        table1: [],
        table2: [],
        table3: [],
        table4: [],
        filteredTable1: [],
        filteredTable2: [],
        filteredTable3: [],
        filteredTable4: [],
        kpis: {
            qualityFact: null,
            qualityPlan: null,
            ballsPerHour: null,
            prodPerHour: null,
            avgTime: null,
            avgPrice: null
        },
        norms: {
            byProjectPool: {},
            byProject: {},
            globalAvg: null
        },
        filters: {
            dateFrom: '',
            dateTo: '',
            tasks: new Set()
        },
        tableFilters: {
            t1: {},
            t2: {},
            t3: {},
            t4: {}
        },
        normHistory: DEFAULT_NORM_HISTORY.slice(),
        employeeMap: { fioToEmail: {}, emailToFio: {} },
        _mainProjects: null
    }
};

export function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            m: state.rawMarkers,
            v: state.rawValidation,
            r: state.rawRecommendations,
            rm: state.rawRecommendationsManual,
            f: state.rawFlatValidations,
            s1: state.rawSuperset1,
            s2: state.rawSuperset2,
            s3: state.rawSuperset3,
            emp: state.rawEmployeeMap,
            normHistory: state.superset.normHistory,
            baseUrl: state.validationBaseUrl,
            domainHistory: state.domainHistory
        }));
    } catch (e) {
        console.error('Ошибка сохранения:', e.message);
    }
}

export function loadFromStorage() {
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        if (s) {
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object') {
                state.rawMarkers = Array.isArray(parsed.m) ? parsed.m : [];
                state.rawValidation = Array.isArray(parsed.v) ? parsed.v : [];
                state.rawRecommendations = Array.isArray(parsed.r) ? parsed.r : [];
                state.rawRecommendationsManual = Array.isArray(parsed.rm) ? parsed.rm : [];
                state.rawFlatValidations = Array.isArray(parsed.f) ? parsed.f : [];
                state.rawSuperset1 = Array.isArray(parsed.s1) ? parsed.s1 : [];
                state.rawSuperset2 = Array.isArray(parsed.s2) ? parsed.s2 : [];
                state.rawSuperset3 = Array.isArray(parsed.s3) ? parsed.s3 : [];
                state.rawEmployeeMap = Array.isArray(parsed.emp) ? parsed.emp : [];
                
                state.validationBaseUrl = typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '';
                state.domainHistory = Array.isArray(parsed.domainHistory) ? parsed.domainHistory : [];
                
                state.superset.normHistory = Array.isArray(parsed.normHistory) && parsed.normHistory.length > 0
                    ? parsed.normHistory
                    : DEFAULT_NORM_HISTORY.slice();
            }
        }
    } catch (e) {
        state.rawMarkers = [];
        state.rawValidation = [];
        state.rawRecommendations = [];
        state.rawRecommendationsManual = [];
        state.rawFlatValidations = [];
        state.rawSuperset1 = [];
        state.rawSuperset2 = [];
        state.rawSuperset3 = [];
        state.rawEmployeeMap = [];
        state.validationBaseUrl = '';
        state.domainHistory = [];
        state.superset.normHistory = DEFAULT_NORM_HISTORY.slice();
    }
}

export function saveFeedbackToStorage() {
    try {
        localStorage.setItem(FB_STORAGE_KEY, JSON.stringify(state.feedbackData));
    } catch (e) {
        console.error('Ошибка сохранения фидбека:', e.message);
    }
}

export function loadFeedbackFromStorage() {
    try {
        const stored = localStorage.getItem(FB_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) state.feedbackData = parsed;
        }
    } catch (e) {
        state.feedbackData = [];
    }
}
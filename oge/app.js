// Основная логика приложения калькулятора-тренажера ОГЭ

const { TASKS_DATA, calculateGrade, PRESETS, CATEGORIES } = window.OGE;

// Состояние приложения
const STATE = {
  scores: {}, // { [taskId]: number }
  expandedTasks: new Set(),
  activeCategory: 'all',
  searchQuery: '',
  practiceModal: {
    isOpen: false,
    taskId: null,
    userAnswer: '',
    checked: false,
    isCorrect: false
  }
};

const STORAGE_KEY = 'oge_math_simulator_v1';

// Инициализация данных
function initApp() {
  loadFromStorage();
  
  // Если ничего не сохранено, активируем пресет "Уверенная 4" (как на макете)
  if (Object.keys(STATE.scores).length === 0) {
    applyPreset('confident4', false);
  }

  setupEventListeners();
  renderApp();
}

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      STATE.scores = parsed.scores || {};
    }
  } catch (e) {
    console.warn('Не удалось загрузить данные из LocalStorage:', e);
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      scores: STATE.scores
    }));
  } catch (e) {
    console.warn('Не удалось сохранить данные:', e);
  }
}

// Расчет текущих показателей
function calculateStats() {
  let totalScore = 0;
  let geometryScore = 0;

  TASKS_DATA.forEach(task => {
    const score = STATE.scores[task.id] || 0;
    totalScore += score;
    if (task.isGeometry) {
      geometryScore += score;
    }
  });

  const gradeResult = calculateGrade(totalScore, geometryScore);

  return {
    totalScore,
    geometryScore,
    maxTotal: 31,
    maxGeometry: 11,
    gradeResult
  };
}

// Применение пресета
function applyPreset(presetId, reRender = true) {
  const preset = PRESETS.find(p => p.id === presetId);
  if (!preset) return;

  const newScores = {};
  TASKS_DATA.forEach(task => {
    if (preset.taskIds.includes(task.id)) {
      if (preset.customPoints && preset.customPoints[task.id] !== undefined) {
        newScores[task.id] = preset.customPoints[task.id];
      } else {
        newScores[task.id] = task.points; // 1 балл для Ч.1, 2 балла для Ч.2 по умолчанию
      }
    } else {
      newScores[task.id] = 0;
    }
  });

  STATE.scores = newScores;
  saveToStorage();

  if (reRender) {
    renderApp();
  }
}

// Переключение баллов задачи
function setTaskScore(taskId, score) {
  STATE.scores[taskId] = score;
  saveToStorage();
  updateStatsUI();
  updateTaskCardUI(taskId);
}

function toggleTaskPart1(taskId) {
  const current = STATE.scores[taskId] || 0;
  setTaskScore(taskId, current > 0 ? 0 : 1);
}

// Управление раскрытием аккордеона
function toggleAccordion(taskId) {
  if (STATE.expandedTasks.has(taskId)) {
    STATE.expandedTasks.delete(taskId);
  } else {
    STATE.expandedTasks.add(taskId);
  }
  updateTaskAccordionUI(taskId);
}

// Обработчики событий
function setupEventListeners() {
  // Категории
  const categoryContainer = document.getElementById('categoryTabs');
  if (categoryContainer) {
    categoryContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-category]');
      if (btn) {
        STATE.activeCategory = btn.dataset.category;
        renderTabs();
        renderTaskList();
      }
    });
  }

  // Пресеты
  const presetsContainer = document.getElementById('presetsList');
  if (presetsContainer) {
    presetsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (btn) {
        applyPreset(btn.dataset.preset);
      }
    });
  }

  // Поиск
  const searchInput = document.getElementById('taskSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      STATE.searchQuery = e.target.value.trim().toLowerCase();
      renderTaskList();
    });
  }

  // Делегирование событий в списке заданий
  const tasksContainer = document.getElementById('tasksContainer');
  if (tasksContainer) {
    tasksContainer.addEventListener('click', (e) => {
      // Клик по чекбоксу части 1
      const checkbox = e.target.closest('.task-checkbox');
      if (checkbox) {
        const taskId = parseInt(checkbox.dataset.taskId, 10);
        toggleTaskPart1(taskId);
        return;
      }

      // Клик по кнопкам баллов части 2
      const pointBtn = e.target.closest('.point-btn');
      if (pointBtn) {
        const taskId = parseInt(pointBtn.dataset.taskId, 10);
        const score = parseInt(pointBtn.dataset.point, 10);
        setTaskScore(taskId, score);
        return;
      }

      // Клик по кнопке мини-тренажера ("Решить")
      const practiceBtn = e.target.closest('.btn-practice');
      if (practiceBtn) {
        e.stopPropagation();
        const taskId = parseInt(practiceBtn.dataset.taskId, 10);
        openPracticeModal(taskId);
        return;
      }

      // Клик по заголовку для открытия/закрытия аккордеона
      const header = e.target.closest('.task-header');
      if (header && !e.target.closest('.no-accordion-trigger')) {
        const taskId = parseInt(header.dataset.taskId, 10);
        toggleAccordion(taskId);
      }
    });
  }

  // Кнопка быстрого теста
  const quickTestBtn = document.getElementById('quickTestBtn');
  if (quickTestBtn) {
    quickTestBtn.addEventListener('click', () => {
      const unsolved = TASKS_DATA.filter(t => !STATE.scores[t.id]);
      const target = unsolved.length > 0 ? unsolved[0] : TASKS_DATA[0];
      openPracticeModal(target.id);
    });
  }

  // Модальное окно
  const modalClose = document.getElementById('modalClose');
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalClose) modalClose.addEventListener('click', closePracticeModal);
  if (modalOverlay) modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closePracticeModal();
  });

  const modalForm = document.getElementById('modalPracticeForm');
  if (modalForm) {
    modalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handlePracticeAnswer();
    });
  }

  // Навигация внутри модального окна (Предыдущая / Следующая задача)
  const prevTaskBtn = document.getElementById('modalPrevTask');
  const nextTaskBtn = document.getElementById('modalNextTask');
  if (prevTaskBtn) {
    prevTaskBtn.addEventListener('click', () => {
      const current = STATE.practiceModal.taskId;
      const prevId = current > 1 ? current - 1 : 25;
      openPracticeModal(prevId);
    });
  }
  if (nextTaskBtn) {
    nextTaskBtn.addEventListener('click', () => {
      const current = STATE.practiceModal.taskId;
      const nextId = current < 25 ? current + 1 : 1;
      openPracticeModal(nextId);
    });
  }

  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && STATE.practiceModal.isOpen) {
      closePracticeModal();
    }
  });
}

// Рендеринг всех вкладок фильтра
function renderTabs() {
  const container = document.getElementById('categoryTabs');
  if (!container) return;

  container.innerHTML = CATEGORIES.map(cat => {
    const isActive = STATE.activeCategory === cat.id;
    return `
      <button 
        data-category="${cat.id}"
        class="px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
          isActive 
            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' 
            : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
        }"
      >
        ${cat.label}
      </button>
    `;
  }).join('');
}

// Рендеринг списка пресетов
function renderPresets() {
  const container = document.getElementById('presetsList');
  if (!container) return;

  container.innerHTML = PRESETS.map(preset => {
    return `
      <button 
        data-preset="${preset.id}"
        title="${preset.hint}"
        class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/50 hover:border-slate-600 transition-all active:scale-95 flex items-center gap-1.5"
      >
        ${preset.label}
      </button>
    `;
  }).join('');
}

// Обновление верхнего блока статистики
function updateStatsUI() {
  const stats = calculateStats();

  // 1. Первичный балл
  const totalScoreEl = document.getElementById('statTotalScore');
  const totalBarEl = document.getElementById('statTotalBar');
  if (totalScoreEl) totalScoreEl.innerText = `${stats.totalScore} / ${stats.maxTotal}`;
  if (totalBarEl) {
    const pct = Math.min(100, Math.round((stats.totalScore / stats.maxTotal) * 100));
    totalBarEl.style.width = `${pct}%`;
  }

  // 2. Геометрия
  const geomScoreEl = document.getElementById('statGeomScore');
  const geomBarEl = document.getElementById('statGeomBar');
  const geomWarnBadge = document.getElementById('geomWarnBadge');
  if (geomScoreEl) geomScoreEl.innerText = `${stats.geometryScore} / ${stats.maxGeometry}`;
  if (geomBarEl) {
    const pct = Math.min(100, Math.round((stats.geometryScore / stats.maxGeometry) * 100));
    geomBarEl.style.width = `${pct}%`;

    if (stats.geometryScore >= 2) {
      geomBarEl.className = 'h-full rounded-full transition-all duration-300 bg-emerald-500';
    } else {
      geomBarEl.className = 'h-full rounded-full transition-all duration-300 bg-amber-500';
    }
  }

  if (geomWarnBadge) {
    if (stats.geometryScore < 2) {
      geomWarnBadge.classList.remove('hidden');
    } else {
      geomWarnBadge.classList.add('hidden');
    }
  }

  // 3. Оценка
  const gradeCard = document.getElementById('statGradeCard');
  const gradeDigit = document.getElementById('statGradeDigit');
  const gradeStatus = document.getElementById('statGradeStatus');
  const geomWarningBanner = document.getElementById('geomWarningBanner');

  if (gradeDigit) gradeDigit.innerText = stats.gradeResult.grade;
  if (gradeStatus) gradeStatus.innerText = stats.gradeResult.status;

  if (gradeCard) {
    gradeCard.className = 'p-4 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden min-h-[105px]';
    if (stats.gradeResult.grade === 2) {
      gradeCard.classList.add(stats.gradeResult.geometryFailed ? 'grade-badge-3' : 'grade-badge-2');
    } else if (stats.gradeResult.grade === 3) {
      gradeCard.classList.add('grade-badge-3');
    } else if (stats.gradeResult.grade === 4) {
      gradeCard.classList.add('grade-badge-4');
    } else {
      gradeCard.classList.add('grade-badge-5');
    }
  }

  // Предупреждающий баннер ловушки геометрии
  if (geomWarningBanner) {
    if (stats.gradeResult.geometryFailed) {
      geomWarningBanner.classList.remove('hidden');
      geomWarningBanner.innerHTML = `
        <div class="flex items-start gap-3 text-amber-200">
          <span class="text-2xl flex-shrink-0">⚠️</span>
          <div>
            <div class="font-bold text-amber-300 text-sm sm:text-base">Внимание: Сработала «Ловушка геометрии»!</div>
            <div class="text-xs sm:text-sm text-slate-300 mt-0.5">
              Вы набрали <strong>${stats.totalScore} баллов</strong> (хватило бы на хорошую оценку), но по разделу Геометрия получено только <strong>${stats.geometryScore} из 2 необходимых</strong>. По правилам ФИПИ итоговая оценка — <strong>2 (Экзамен не сдан)</strong>! Решите хотя бы задания №18 и №19.
            </div>
          </div>
        </div>
      `;
    } else {
      geomWarningBanner.classList.add('hidden');
    }
  }
}

// Рендеринг списка заданий
function renderTaskList() {
  const container = document.getElementById('tasksContainer');
  if (!container) return;

  const filtered = TASKS_DATA.filter(task => {
    // Фильтр по категории
    if (STATE.activeCategory !== 'all' && task.category !== STATE.activeCategory) {
      return false;
    }
    // Фильтр по поиску
    if (STATE.searchQuery) {
      const q = STATE.searchQuery;
      const matchNum = task.num.toString() === q || `№${task.num}` === q;
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchTraps = task.traps.some(t => t.toLowerCase().includes(q));
      return matchNum || matchTitle || matchTraps;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-500">
        <div class="text-4xl mb-2">🔍</div>
        <div>Задания не найдены. Попробуйте изменить параметры поиска или фильтра.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(task => renderTaskCardHTML(task)).join('');
}

// Генерация HTML карточки задания
function renderTaskCardHTML(task) {
  const currentScore = STATE.scores[task.id] || 0;
  const isPart2 = task.points === 2;
  const isExpanded = STATE.expandedTasks.has(task.id);
  const isSolved = currentScore > 0;

  let scoreControlsHTML = '';
  if (isPart2) {
    scoreControlsHTML = `
      <div class="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-700/60 no-accordion-trigger" title="Выберите полученный балл (0, 1 или 2)">
        <button data-task-id="${task.id}" data-point="0" class="point-btn ${currentScore === 0 ? 'is-active' : ''}">0</button>
        <button data-task-id="${task.id}" data-point="1" class="point-btn ${currentScore === 1 ? 'is-active' : ''}">1</button>
        <button data-task-id="${task.id}" data-point="2" class="point-btn ${currentScore === 2 ? 'is-active' : ''}">2</button>
      </div>
    `;
  } else {
    scoreControlsHTML = `
      <label class="flex items-center cursor-pointer no-accordion-trigger p-1" title="Отметить как решенное (1 балл)">
        <input 
          type="checkbox" 
          data-task-id="${task.id}"
          class="custom-checkbox task-checkbox" 
          ${currentScore > 0 ? 'checked' : ''}
        />
      </label>
    `;
  }

  return `
    <div id="task-card-${task.id}" class="task-card rounded-2xl overflow-hidden mb-3 ${isSolved ? 'is-active' : ''} ${task.isGeometry ? 'is-geometry' : ''}">
      <!-- Шапка карточки -->
      <div 
        data-task-id="${task.id}" 
        class="task-header p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
      >
        <div class="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          ${scoreControlsHTML}

          <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <span class="px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700 flex-shrink-0">
              ${task.badge}
            </span>
            <div class="min-w-0">
              <span class="text-sm sm:text-base font-medium text-slate-100 truncate block">
                ${task.title}
              </span>
              <div class="flex items-center gap-2 mt-0.5 sm:hidden">
                <span class="text-xs text-slate-400">
                  ${isPart2 ? `${currentScore}/2 б.` : `${task.points} балл`}
                </span>
                ${task.isGeometry ? '<span class="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">Геометрия</span>' : ''}
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div class="hidden sm:flex items-center gap-2">
            ${task.isGeometry ? '<span class="text-xs text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/50">Геометрия</span>' : ''}
            <span class="text-xs font-medium text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-md border border-slate-700/50">
              ${isPart2 ? `${currentScore}/2 б.` : `${task.points} балл`}
            </span>
          </div>

          <!-- Кнопка быстрой тренировки -->
          <button 
            data-task-id="${task.id}"
            class="btn-practice no-accordion-trigger px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 border border-blue-800/50 transition-all flex items-center gap-1.5 active:scale-95"
            title="Открыть практическое задание"
          >
            <span>🎯</span>
            <span class="hidden md:inline">Решить</span>
          </button>

          <!-- Стрелка аккордеона -->
          <div class="w-7 h-7 rounded-lg bg-slate-800/50 flex items-center justify-center text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-blue-400' : ''}">
            ▼
          </div>
        </div>
      </div>

      <!-- Раскрывающаяся часть аккордеона -->
      <div id="accordion-${task.id}" class="accordion-content ${isExpanded ? 'is-open' : ''}">
        <div class="accordion-inner px-4 pb-4 pt-1 border-t border-slate-800/80 bg-slate-900/40">
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-2">
            <!-- Блок ловушек -->
            <div class="bg-red-950/20 border border-red-900/30 rounded-xl p-3.5">
              <div class="flex items-center gap-2 text-red-400 font-semibold text-xs sm:text-sm mb-2">
                <span>⚠️</span>
                <span>Главные ловушки ФИПИ:</span>
              </div>
              <ul class="text-xs sm:text-sm text-slate-300 space-y-2 list-disc list-inside">
                ${task.traps.map(trap => `<li class="leading-relaxed"><span class="text-slate-300">${trap}</span></li>`).join('')}
              </ul>
            </div>

            <!-- Блок советов и лайфхаков -->
            <div class="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-3.5">
              <div class="flex items-center gap-2 text-emerald-400 font-semibold text-xs sm:text-sm mb-2">
                <span>💡</span>
                <span>Формулы и лайфхаки:</span>
              </div>
              <ul class="text-xs sm:text-sm text-slate-300 space-y-2 list-disc list-inside">
                ${task.tips.map(tip => `<li class="leading-relaxed"><span class="text-slate-300">${tip}</span></li>`).join('')}
              </ul>
            </div>
          </div>

          <!-- Мини-практика прямо внутри карточки -->
          <div class="mt-3.5 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3 bg-slate-800/20 p-3 rounded-xl">
            <div class="text-xs text-slate-400 flex items-center gap-1.5">
              <span>Пример задания:</span>
              <span class="text-slate-200 font-medium">${task.samplePractice.question.slice(0, 75)}...</span>
            </div>
            <button 
              data-task-id="${task.id}" 
              class="btn-practice text-xs font-medium text-blue-400 hover:text-blue-300 underline underline-offset-4 flex items-center gap-1"
            >
              Пройти тренировку с быстрой проверкой →
            </button>
          </div>

        </div>
      </div>
    </div>
  `;
}

// Точечное обновление интерфейса при клике на чекбокс (без полной перерисовки для плавности)
function updateTaskCardUI(taskId) {
  const card = document.getElementById(`task-card-${taskId}`);
  if (!card) return;

  const currentScore = STATE.scores[taskId] || 0;
  const isSolved = currentScore > 0;

  if (isSolved) {
    card.classList.add('is-active');
  } else {
    card.classList.remove('is-active');
  }

  // Обновляем кнопки 0, 1, 2 если часть 2
  const pointBtns = card.querySelectorAll('.point-btn');
  pointBtns.forEach(btn => {
    const pt = parseInt(btn.dataset.point, 10);
    if (pt === currentScore) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  });

  // Чекбокс
  const cb = card.querySelector('.task-checkbox');
  if (cb) {
    cb.checked = isSolved;
  }
}

function updateTaskAccordionUI(taskId) {
  const accordion = document.getElementById(`accordion-${taskId}`);
  const header = document.querySelector(`.task-header[data-task-id="${taskId}"]`);
  if (!accordion || !header) return;

  const arrow = header.querySelector('.w-7.h-7');
  const isExpanded = STATE.expandedTasks.has(taskId);

  if (isExpanded) {
    accordion.classList.add('is-open');
    if (arrow) {
      arrow.classList.add('rotate-180', 'text-blue-400');
    }
  } else {
    accordion.classList.remove('is-open');
    if (arrow) {
      arrow.classList.remove('rotate-180', 'text-blue-400');
    }
  }
}

// Модальное окно быстрой тренировки ("Ответить сразу")
function openPracticeModal(taskId) {
  const task = TASKS_DATA.find(t => t.id === taskId);
  if (!task) return;

  STATE.practiceModal = {
    isOpen: true,
    taskId: task.id,
    userAnswer: '',
    checked: false,
    isCorrect: false
  };

  const modal = document.getElementById('practiceModal');
  const modalTitle = document.getElementById('modalTaskTitle');
  const modalBadge = document.getElementById('modalTaskBadge');
  const modalQuestion = document.getElementById('modalQuestionText');
  const modalInput = document.getElementById('modalAnswerInput');
  const modalResult = document.getElementById('modalResultBlock');

  if (modalTitle) modalTitle.innerText = task.title;
  if (modalBadge) modalBadge.innerText = `Задание ${task.badge}`;
  if (modalQuestion) modalQuestion.innerText = task.samplePractice.question;
  if (modalInput) {
    modalInput.value = '';
    modalInput.disabled = false;
    modalInput.focus();
  }
  if (modalResult) {
    modalResult.classList.add('hidden');
    modalResult.innerHTML = '';
  }

  const submitBtn = document.getElementById('modalSubmitBtn');
  if (submitBtn) {
    submitBtn.classList.remove('hidden');
  }

  if (modal) modal.classList.remove('hidden');
}

function closePracticeModal() {
  const modal = document.getElementById('practiceModal');
  if (modal) modal.classList.add('hidden');
  STATE.practiceModal.isOpen = false;
}

function handlePracticeAnswer() {
  const task = TASKS_DATA.find(t => t.id === STATE.practiceModal.taskId);
  const input = document.getElementById('modalAnswerInput');
  const modalResult = document.getElementById('modalResultBlock');
  const submitBtn = document.getElementById('modalSubmitBtn');
  if (!task || !input || !modalResult) return;

  const rawUser = input.value.trim().toLowerCase().replace(',', '.');
  const rawCorrect = task.samplePractice.answer.trim().toLowerCase().replace(',', '.');

  const isCorrect = rawUser === rawCorrect;
  STATE.practiceModal.checked = true;
  STATE.practiceModal.isCorrect = isCorrect;

  modalResult.classList.remove('hidden');
  if (isCorrect) {
    // Автоматически засчитываем балл ученику!
    setTaskScore(task.id, task.points);

    modalResult.innerHTML = `
      <div class="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-4 text-emerald-200">
        <div class="flex items-center gap-2 font-bold text-emerald-400 text-base mb-1">
          <span>🎉</span> Правильно! (+${task.points} ${task.points === 1 ? 'балл' : 'балла'})
        </div>
        <div class="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
          <strong>Пояснение:</strong> ${task.samplePractice.explanation}
        </div>
        <div class="mt-3 text-xs text-emerald-300/80">
          Балл автоматически добавлен в калькулятор!
        </div>
      </div>
    `;
  } else {
    modalResult.innerHTML = `
      <div class="bg-red-950/40 border border-red-500/50 rounded-xl p-4 text-red-200">
        <div class="flex items-center gap-2 font-bold text-red-400 text-base mb-1">
          <span>❌</span> Неверно
        </div>
        <div class="text-xs sm:text-sm text-slate-300 mt-1">
          Ваш ответ: <span class="font-mono text-red-300 font-semibold">${input.value}</span>. Правильный ответ: <span class="font-mono text-emerald-400 font-semibold">${task.samplePractice.answer}</span>
        </div>
        <div class="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed pt-2 border-t border-red-900/40">
          <strong>Разбор:</strong> ${task.samplePractice.explanation}
        </div>
      </div>
    `;
  }

  if (submitBtn) {
    submitBtn.classList.add('hidden');
  }
}

// Главный рендер всего интерфейса
function renderApp() {
  renderTabs();
  renderPresets();
  updateStatsUI();
  renderTaskList();
}

// Запуск при загрузке документа
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

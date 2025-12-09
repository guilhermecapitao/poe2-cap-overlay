import { ipcRenderer } from 'electron';

import type { Run, Quest, QuestData, Settings, ActStats, TimerState, Language } from '../types';

// State
interface OverlayState {
  activeRunId: string | null;
  activeRun: Run | null;
  questData: QuestData;
  settings: Settings;
  currentAct: number;
  skippedQuests: string[];
  timer: TimerState;
}

const state: OverlayState = {
  activeRunId: null,
  activeRun: null,
  questData: { acts: [] },
  settings: {} as Settings,
  currentAct: 1,
  skippedQuests: [],
  timer: {
    elapsed: 0,
    running: false,
    interval: null,
    startTime: null
  }
};

// DOM Helper
function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// Initialize overlay
async function init(): Promise<void> {
  try {
    state.activeRunId = await ipcRenderer.invoke('get-active-run');
    state.questData = await ipcRenderer.invoke('get-quest-data');
    state.settings = await ipcRenderer.invoke('get-settings');

    if (state.activeRunId) {
      const runs: Run[] = await ipcRenderer.invoke('get-runs');
      state.activeRun = runs.find(r => r.id === state.activeRunId) || null;
      state.skippedQuests = await ipcRenderer.invoke('get-skipped-quests', state.activeRunId);

      if (state.activeRun?.timerElapsed) {
        state.timer.elapsed = state.activeRun.timerElapsed;
      }
    }

    setupEventListeners();
    render();
    updateTimerDisplay();
  } catch (error) {
    console.error('Failed to initialize overlay:', error);
  }
}

// Setup event listeners
function setupEventListeners(): void {
  $('actSelectorBtn')?.addEventListener('click', toggleActSelector);
  $('timerPlayPause')?.addEventListener('click', toggleTimer);
  $('timerReset')?.addEventListener('click', resetTimer);
  $('timerToggleBtn')?.addEventListener('click', () => {
    const controls = $('timerControls');
    if (controls) {
      controls.style.display = controls.style.display === 'none' ? 'flex' : 'none';
    }
  });

  $('closeOverlayBtn')?.addEventListener('click', () => {
    saveTimerState();
    window.close();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = $('actSelectorDropdown');
    const btn = $('actSelectorBtn');
    if (dropdown && btn && !dropdown.contains(e.target as Node) && !btn.contains(e.target as Node)) {
      closeActSelector();
    }
  });

  // IPC listeners
  ipcRenderer.on('active-run-changed', async (_event, runId: string | null) => {
    saveTimerState();

    state.activeRunId = runId;
    if (runId) {
      const runs: Run[] = await ipcRenderer.invoke('get-runs');
      state.activeRun = runs.find(r => r.id === runId) || null;
      state.skippedQuests = await ipcRenderer.invoke('get-skipped-quests', runId);

      state.timer.elapsed = state.activeRun?.timerElapsed || 0;
      state.timer.running = false;
      if (state.timer.interval) {
        clearInterval(state.timer.interval);
        state.timer.interval = null;
      }
    } else {
      state.activeRun = null;
      state.skippedQuests = [];
      state.timer.elapsed = 0;
      state.timer.running = false;
    }
    render();
    updateTimerDisplay();
    updateTimerButton();
  });

  ipcRenderer.on('quest-progress-updated', async () => {
    if (state.activeRunId) {
      const runs: Run[] = await ipcRenderer.invoke('get-runs');
      state.activeRun = runs.find(r => r.id === state.activeRunId) || null;
      render();
    }
  });

  ipcRenderer.on('run-reset', async (_event, runId: string) => {
    if (runId === state.activeRunId) {
      const runs: Run[] = await ipcRenderer.invoke('get-runs');
      state.activeRun = runs.find(r => r.id === runId) || null;
      state.skippedQuests = [];

      state.timer.elapsed = 0;
      state.timer.running = false;
      if (state.timer.interval) {
        clearInterval(state.timer.interval);
        state.timer.interval = null;
      }

      render();
      updateTimerDisplay();
      updateTimerButton();
    }
  });
}

// Toggle act selector dropdown
function toggleActSelector(): void {
  const dropdown = $('actSelectorDropdown');
  const btn = $('actSelectorBtn');

  if (dropdown && btn) {
    if (dropdown.style.display === 'none') {
      renderActSelector();
      dropdown.style.display = 'block';
      btn.classList.add('open');
    } else {
      closeActSelector();
    }
  }
}

// Close act selector
function closeActSelector(): void {
  const dropdown = $('actSelectorDropdown');
  const btn = $('actSelectorBtn');
  if (dropdown) dropdown.style.display = 'none';
  if (btn) btn.classList.remove('open');
}

// Render act selector
function renderActSelector(): void {
  const container = $('actSelectorList');
  if (!container) return;

  const acts = state.questData.acts || [];
  const lang: Language = state.settings.language || 'pt';

  container.innerHTML = acts.map((act, index) => {
    const actNumber = index + 1;
    const actName = typeof act.actName === 'object' ? act.actName[lang] : act.actName;
    const stats = calculateActStats(actNumber);
    const isActive = actNumber === state.currentAct;
    const hasIncomplete = stats.required.remaining > 0 || stats.important.remaining > 0;

    return `
      <div class="act-selector-item ${isActive ? 'active' : ''}" data-act="${actNumber}">
        <span class="act-selector-item-name">${escapeHtml(actName || `Ato ${actNumber}`)}</span>
        <div class="act-selector-item-badges">
          ${hasIncomplete
            ? `<span class="act-selector-badge incomplete">${stats.required.remaining + stats.important.remaining} pendentes</span>`
            : `<span class="act-selector-badge complete">Completo</span>`
          }
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.act-selector-item').forEach(item => {
    item.addEventListener('click', () => {
      const actNumber = parseInt((item as HTMLElement).dataset.act || '1');
      state.currentAct = actNumber;
      closeActSelector();
      render();
    });
  });
}

// Render UI
function render(): void {
  if (!state.activeRun) {
    showEmptyState();
    return;
  }

  hideEmptyState();
  renderHeader();
  renderProgress();
  renderStats();
  renderQuests();
}

// Show empty state
function showEmptyState(): void {
  const empty = $('overlayEmpty');
  const content = $('overlayContent');
  const progress = document.querySelector('.overlay-progress') as HTMLElement;
  const stats = document.querySelector('.overlay-stats') as HTMLElement;

  if (empty) empty.style.display = 'flex';
  if (content) content.style.display = 'none';
  if (progress) progress.style.display = 'none';
  if (stats) stats.style.display = 'none';
}

// Hide empty state
function hideEmptyState(): void {
  const empty = $('overlayEmpty');
  const content = $('overlayContent');
  const progress = document.querySelector('.overlay-progress') as HTMLElement;
  const stats = document.querySelector('.overlay-stats') as HTMLElement;

  if (empty) empty.style.display = 'none';
  if (content) content.style.display = 'block';
  if (progress) progress.style.display = 'block';
  if (stats) stats.style.display = 'grid';
}

// Render header
function renderHeader(): void {
  const title = $('overlayActTitle');
  const act = state.questData.acts?.[state.currentAct - 1];

  if (title && act) {
    const lang: Language = state.settings.language || 'pt';
    const actName = typeof act.actName === 'object' ? act.actName[lang] : act.actName;
    title.textContent = actName || `Ato ${state.currentAct}`;
  } else if (title) {
    title.textContent = `Ato ${state.currentAct}`;
  }
}

// Render progress
function renderProgress(): void {
  const act = state.questData.acts?.[state.currentAct - 1];
  if (!act || !state.activeRun) return;

  const quests = act.quests || [];
  const completed = quests.filter(q => state.activeRun?.completedQuests?.[q.id]).length;
  const total = quests.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const percentEl = $('overlayProgressPercent');
  const barEl = $('overlayProgressBar');

  if (percentEl) percentEl.textContent = `${percent}%`;
  if (barEl) barEl.style.width = `${percent}%`;
}

// Calculate act stats
function calculateActStats(actNumber: number): ActStats {
  const act = state.questData.acts?.[actNumber - 1];
  const emptyStats = { total: 0, completed: 0, remaining: 0 };

  if (!act || !state.activeRun) {
    return {
      total: 0,
      completed: 0,
      percent: 0,
      required: emptyStats,
      important: emptyStats,
      optional: emptyStats,
      critical: emptyStats
    };
  }

  const quests = act.quests || [];

  const requiredQuests = quests.filter(q => !q.importance || q.importance === 'normal');
  const requiredCompleted = requiredQuests.filter(q => state.activeRun?.completedQuests?.[q.id]).length;

  const importantQuests = quests.filter(q => q.importance === 'critical' || q.importance === 'important' || q.importance === 'unique');
  const importantCompleted = importantQuests.filter(q => state.activeRun?.completedQuests?.[q.id]).length;

  const optionalQuests = quests.filter(q => q.importance === 'optional');
  const optionalCompleted = optionalQuests.filter(q => state.activeRun?.completedQuests?.[q.id]).length;

  const total = quests.length;
  const completed = quests.filter(q => state.activeRun?.completedQuests?.[q.id]).length;

  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    required: {
      total: requiredQuests.length,
      completed: requiredCompleted,
      remaining: requiredQuests.length - requiredCompleted
    },
    important: {
      total: importantQuests.length,
      completed: importantCompleted,
      remaining: importantQuests.length - importantCompleted
    },
    optional: {
      total: optionalQuests.length,
      completed: optionalCompleted,
      remaining: optionalQuests.length - optionalCompleted
    },
    critical: {
      total: quests.filter(q => q.importance === 'critical').length,
      completed: quests.filter(q => q.importance === 'critical' && state.activeRun?.completedQuests?.[q.id]).length,
      remaining: 0
    }
  };
}

// Render stats
function renderStats(): void {
  const stats = calculateActStats(state.currentAct);

  const requiredEl = $('requiredCount');
  const importantEl = $('importantCount');
  const optionalEl = $('optionalCount');

  if (requiredEl) requiredEl.textContent = `${stats.required.completed}/${stats.required.total}`;
  if (importantEl) importantEl.textContent = `${stats.important.completed}/${stats.important.total}`;
  if (optionalEl) optionalEl.textContent = `${stats.optional.completed}/${stats.optional.total}`;
}

// Render quests
function renderQuests(): void {
  const container = $('overlayQuests');
  if (!container || !state.activeRun) return;

  const act = state.questData.acts?.[state.currentAct - 1];
  if (!act) {
    container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: var(--spacing-lg); font-size: 0.75rem;">Nenhuma quest encontrada</p>';
    return;
  }

  const quests = act.quests || [];
  const lang: Language = state.settings.language || 'pt';

  interface DisplayQuest extends Quest {
    isSkipped: boolean;
    isCompleted: boolean;
    originalIndex: number;
  }

  // Map quests with their status
  const displayQuests: DisplayQuest[] = quests.map((q, idx) => ({
    ...q,
    isSkipped: state.skippedQuests.includes(q.id),
    isCompleted: state.activeRun?.completedQuests?.[q.id] || false,
    originalIndex: idx
  }));

  // Sort: uncompleted first, then skipped, then completed
  displayQuests.sort((a, b) => {
    // Completed quests go to the very end
    if (a.isCompleted && !b.isCompleted) return 1;
    if (!a.isCompleted && b.isCompleted) return -1;

    // Among non-completed: skipped quests go after normal ones
    if (!a.isCompleted && !b.isCompleted) {
      if (a.isSkipped && !b.isSkipped) return 1;
      if (!a.isSkipped && b.isSkipped) return -1;
    }

    // Keep original order within each group
    return a.originalIndex - b.originalIndex;
  });

  container.innerHTML = displayQuests.map((quest) => {
    const isCompleted = quest.isCompleted;
    const isSkipped = quest.isSkipped;
    const questName = typeof quest.name === 'object' ? quest.name[lang] : quest.name;
    const questZone = typeof quest.zone === 'object' ? quest.zone[lang] : quest.zone;
    const questDesc = typeof quest.description === 'object' ? quest.description[lang] : quest.description;
    const questReward = quest.reward ? (typeof quest.reward === 'object' ? quest.reward[lang] : quest.reward) : null;
    const canSkip = quest.importance === 'optional';

    return `
      <div class="overlay-quest-item importance-${quest.importance || 'normal'} ${isCompleted ? 'completed' : ''} ${isSkipped ? 'skipped' : ''}"
           data-quest-id="${quest.id}">
        <input type="checkbox"
               class="checkbox overlay-quest-checkbox"
               ${isCompleted ? 'checked' : ''}
               data-quest-id="${quest.id}">
        <div class="overlay-quest-content">
          <div class="overlay-quest-name">${escapeHtml(questName)}</div>
          <div class="overlay-quest-zone">${escapeHtml(questZone)}</div>
          ${questDesc ? `<div class="overlay-quest-description">${escapeHtml(questDesc)}</div>` : ''}
          ${questReward ? `
            <div class="overlay-quest-reward">
              🎁 ${escapeHtml(questReward)}
            </div>
          ` : ''}
        </div>
        ${canSkip && !isCompleted ? `
          <button class="quest-skip-btn" data-quest-id="${quest.id}" title="${isSkipped ? 'Desfazer' : 'Pular para depois'}">
            ${isSkipped ? 'Voltar' : 'Pular'}
          </button>
        ` : ''}
      </div>
    `;
  }).join('');

  // Add checkbox handlers
  container.querySelectorAll('.overlay-quest-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const questId = target.dataset.questId;
      const completed = target.checked;
      const questItem = target.closest('.overlay-quest-item');

      if (!questId) return;

      if (completed && questItem) {
        questItem.classList.add('just-completed');
        await new Promise(resolve => setTimeout(resolve, 400));
        questItem.classList.remove('just-completed');
      }

      await ipcRenderer.invoke('update-quest-progress', {
        runId: state.activeRunId,
        questId,
        completed
      });

      if (state.activeRun) {
        if (!state.activeRun.completedQuests) {
          state.activeRun.completedQuests = {};
        }
        state.activeRun.completedQuests[questId] = completed;
      }

      render();
    });
  });

  // Add skip button handlers
  container.querySelectorAll('.quest-skip-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      const questId = target.dataset.questId;

      if (!questId) return;

      const isSkipped = state.skippedQuests.includes(questId);

      if (isSkipped) {
        await ipcRenderer.invoke('unskip-quest', {
          runId: state.activeRunId,
          questId
        });
        state.skippedQuests = state.skippedQuests.filter(id => id !== questId);
      } else {
        await ipcRenderer.invoke('skip-quest', {
          runId: state.activeRunId,
          questId
        });
        state.skippedQuests.push(questId);
      }

      render();
    });
  });
}

// Timer functions
function toggleTimer(): void {
  if (state.timer.running) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer(): void {
  if (!state.activeRunId) return;

  state.timer.running = true;
  state.timer.startTime = Date.now() - state.timer.elapsed;

  state.timer.interval = setInterval(() => {
    if (state.timer.startTime) {
      state.timer.elapsed = Date.now() - state.timer.startTime;
      updateTimerDisplay();
    }
  }, 1000);

  updateTimerButton();
}

function pauseTimer(): void {
  state.timer.running = false;

  if (state.timer.interval) {
    clearInterval(state.timer.interval);
    state.timer.interval = null;
  }

  updateTimerButton();
  saveTimerState();
}

async function resetTimer(): Promise<void> {
  const confirmed = await showConfirm('Resetar timer?', 'Esta ação não pode ser desfeita.');
  if (!confirmed) return;

  state.timer.elapsed = 0;
  state.timer.running = false;

  if (state.timer.interval) {
    clearInterval(state.timer.interval);
    state.timer.interval = null;
  }

  updateTimerDisplay();
  updateTimerButton();
  await saveTimerState();
}

function updateTimerDisplay(): void {
  const display = $('timerDisplay');
  if (!display) return;

  const totalSeconds = Math.floor(state.timer.elapsed / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    display.textContent = `${hours}:${pad(minutes)}:${pad(seconds)}`;
  } else {
    display.textContent = `${minutes}:${pad(seconds)}`;
  }
}

function updateTimerButton(): void {
  const btn = $('timerPlayPause');
  const icon = $('playPauseIcon');

  const playSvg = '<svg class="icon-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  const pauseSvg = '<svg class="icon-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>';

  if (btn && icon) {
    if (state.timer.running) {
      icon.innerHTML = pauseSvg;
      btn.classList.add('playing');
      btn.title = 'Pausar';
    } else {
      icon.innerHTML = playSvg;
      btn.classList.remove('playing');
      btn.title = 'Play';
    }
  }
}

async function saveTimerState(): Promise<void> {
  if (!state.activeRunId || !state.activeRun) return;

  const runs: Run[] = await ipcRenderer.invoke('get-runs');
  const run = runs.find(r => r.id === state.activeRunId);

  if (run) {
    run.timerElapsed = state.timer.elapsed;
    await ipcRenderer.invoke('save-run', run);
  }
}

function pad(num: number): string {
  return num.toString().padStart(2, '0');
}

// Custom confirm dialog
function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'custom-modal-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.15s ease-out;
    `;

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.style.cssText = `
      background: rgba(13, 12, 10, 0.98);
      border: 1px solid rgba(80, 70, 50, 0.5);
      border-radius: 8px;
      padding: 20px;
      min-width: 280px;
      max-width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      animation: slideIn 0.15s ease-out;
    `;

    modal.innerHTML = `
      <h3 style="margin: 0 0 8px 0; color: #e8d59e; font-size: 0.95rem; font-weight: 600;">${escapeHtml(title)}</h3>
      <p style="margin: 0 0 20px 0; color: #9c978c; font-size: 0.8rem; line-height: 1.4;">${escapeHtml(message)}</p>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button class="custom-modal-btn cancel" style="
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          color: #9c978c;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.15s;
        ">Cancelar</button>
        <button class="custom-modal-btn confirm" style="
          padding: 8px 16px;
          background: linear-gradient(180deg, rgba(201, 162, 39, 0.3) 0%, rgba(154, 123, 28, 0.25) 100%);
          border: 1px solid rgba(201, 162, 39, 0.5);
          border-radius: 4px;
          color: #e8c366;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        ">Confirmar</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Add hover effects
    const cancelBtn = modal.querySelector('.cancel') as HTMLButtonElement;
    const confirmBtn = modal.querySelector('.confirm') as HTMLButtonElement;

    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = 'rgba(255, 255, 255, 0.15)';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    });

    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.background = 'linear-gradient(180deg, rgba(201, 162, 39, 0.4) 0%, rgba(154, 123, 28, 0.35) 100%)';
    });
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.background = 'linear-gradient(180deg, rgba(201, 162, 39, 0.3) 0%, rgba(154, 123, 28, 0.25) 100%)';
    });

    // Handle clicks
    cancelBtn.addEventListener('click', () => {
      backdrop.remove();
      resolve(false);
    });

    confirmBtn.addEventListener('click', () => {
      backdrop.remove();
      resolve(true);
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.remove();
        resolve(false);
      }
    });
  });
}

// Utility functions
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);

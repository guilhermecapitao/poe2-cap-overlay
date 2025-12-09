/* eslint-disable @typescript-eslint/no-require-imports */

// Get electron module
const electronModule = require('electron');

// Get ipcRenderer and shell - handle both cases (module object or path string)
let ipcRenderer: Electron.IpcRenderer;
let shell: Electron.Shell;

if (typeof electronModule === 'object' && electronModule.ipcRenderer) {
  ipcRenderer = electronModule.ipcRenderer;
  shell = electronModule.shell;
} else {
  // Create dummy modules to prevent crashes
  ipcRenderer = {
    invoke: async () => null,
    on: () => ipcRenderer,
    send: () => {}
  } as unknown as Electron.IpcRenderer;
  shell = {
    openExternal: async () => {}
  } as unknown as Electron.Shell;
}

// GitHub repository URL
const GITHUB_URL = 'https://github.com/guilhermecapitao/poe2-cap-overlay';

import type { Run, Quest, QuestData, Settings, ActStats, Language } from '../types';

// State
interface AppState {
  runs: Run[];
  activeRunId: string | null;
  questData: QuestData;
  settings: Settings;
  currentAct: number;
  editingRunId: string | null;
  expandedActs: Set<number>;
}

const state: AppState = {
  runs: [],
  activeRunId: null,
  questData: { acts: [] },
  settings: {} as Settings,
  currentAct: 1,
  editingRunId: null,
  expandedActs: new Set([1])
};

// Load expanded acts from localStorage
function loadExpandedActs(): void {
  try {
    const saved = localStorage.getItem('poe2-expanded-acts');
    if (saved) {
      const acts = JSON.parse(saved);
      state.expandedActs = new Set(acts);
    }
  } catch {
    state.expandedActs = new Set([1]);
  }
}

// Save expanded acts to localStorage
function saveExpandedActs(): void {
  localStorage.setItem('poe2-expanded-acts', JSON.stringify([...state.expandedActs]));
}

// Toggle act expansion
function toggleActExpansion(actNumber: number): void {
  if (state.expandedActs.has(actNumber)) {
    state.expandedActs.delete(actNumber);
  } else {
    state.expandedActs.add(actNumber);
  }
  state.currentAct = actNumber;
  saveExpandedActs();
  renderAccordion();
}

// DOM Helper
function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// Initialize app
async function init(): Promise<void> {
  // Setup event listeners FIRST, before any async operations
  setupEventListeners();

  try {
    state.runs = await ipcRenderer.invoke('get-runs');
    state.activeRunId = await ipcRenderer.invoke('get-active-run');
    state.questData = await ipcRenderer.invoke('get-quest-data');
    state.settings = await ipcRenderer.invoke('get-settings');
    loadExpandedActs();

    renderRunsList();
    renderRunDetails();
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

// Setup event listeners
function setupEventListeners(): void {
  // Header buttons
  $('toggleOverlayBtn')?.addEventListener('click', toggleOverlay);
  $('settingsBtn')?.addEventListener('click', openSettingsModal);

  // New run buttons
  $('newRunBtn')?.addEventListener('click', () => openRunModal());
  $('emptyStateNewRunBtn')?.addEventListener('click', () => openRunModal());

  // Run details
  $('editRunBtn')?.addEventListener('click', () => openRunModal(state.activeRunId));
  $('deleteRunBtn')?.addEventListener('click', deleteCurrentRun);
  $('resetRunBtn')?.addEventListener('click', resetRunProgress);
  $('actSelect')?.addEventListener('change', handleActChange);

  // Run modal
  $('runModalClose')?.addEventListener('click', closeRunModal);
  $('runModalBackdrop')?.addEventListener('click', closeRunModal);
  $('runModalCancel')?.addEventListener('click', closeRunModal);
  $('runModalSave')?.addEventListener('click', saveRun);

  // Settings modal
  $('settingsModalClose')?.addEventListener('click', closeSettingsModal);
  $('settingsModalBackdrop')?.addEventListener('click', closeSettingsModal);
  $('settingsModalCancel')?.addEventListener('click', closeSettingsModal);
  $('settingsModalSave')?.addEventListener('click', saveSettings);

  // Settings inputs
  $('opacitySlider')?.addEventListener('input', handleOpacityChange);

  // GitHub link - open in external browser
  $('githubLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    shell.openExternal(GITHUB_URL);
  });

  // IPC listeners
  ipcRenderer.on('active-run-changed', (_event, runId: string) => {
    state.activeRunId = runId;
    renderRunsList();
    renderRunDetails();
  });

  ipcRenderer.on('quest-progress-updated', async () => {
    // Reload runs data and re-render
    state.runs = await ipcRenderer.invoke('get-runs');
    renderRunsList();
    renderAccordion();
  });
}

// Toggle overlay
async function toggleOverlay(): Promise<void> {
  await ipcRenderer.invoke('toggle-overlay');
}

// Render runs list
function renderRunsList(): void {
  const container = $('runsList');
  if (!container) return;

  if (state.runs.length === 0) {
    container.innerHTML = `
      <div style="padding: var(--spacing-lg); text-align: center; color: var(--text-secondary);">
        <p style="font-size: 0.875rem;">Nenhuma run criada ainda</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.runs.map(run => {
    const progress = calculateRunProgress(run);
    const isActive = run.id === state.activeRunId;

    return `
      <div class="run-item ${isActive ? 'active' : ''}" data-run-id="${run.id}">
        <div class="run-item-header">
          <div>
            <div class="run-item-name">${escapeHtml(run.name)}</div>
            <div class="run-item-class">${escapeHtml(run.class)}</div>
          </div>
        </div>
        <div class="run-item-progress">
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
            <span style="color: var(--text-secondary);">Progresso</span>
            <span style="color: var(--accent-gold); font-weight: 600;">${progress.toFixed(0)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${progress}%"></div>
          </div>
        </div>
        <div class="run-item-stats">
          <span>${formatDate(run.createdAt)}</span>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.run-item').forEach(item => {
    item.addEventListener('click', () => {
      const runId = (item as HTMLElement).dataset.runId;
      if (runId) selectRun(runId);
    });
  });
}

// Select run
async function selectRun(runId: string): Promise<void> {
  state.activeRunId = runId;
  await ipcRenderer.invoke('set-active-run', runId);
  renderRunsList();
  renderRunDetails();
}

// Render run details
function renderRunDetails(): void {
  const emptyState = $('emptyState');
  const runDetails = $('runDetails');

  if (!state.activeRunId || !state.runs.find(r => r.id === state.activeRunId)) {
    if (emptyState) emptyState.style.display = 'flex';
    if (runDetails) runDetails.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (runDetails) runDetails.style.display = 'block';

  const run = state.runs.find(r => r.id === state.activeRunId);
  if (!run) return;

  const runNameEl = $('runName');
  const runClassEl = $('runClass');
  const runCreatedEl = $('runCreated');

  if (runNameEl) runNameEl.textContent = run.name;
  if (runClassEl) runClassEl.textContent = run.class;
  if (runCreatedEl) runCreatedEl.textContent = `Criada em ${formatDate(run.createdAt)}`;

  renderAccordion();
}

// Render accordion layout with all acts
function renderAccordion(): void {
  const container = $('actsAccordion');
  if (!container) return;

  const run = state.runs.find(r => r.id === state.activeRunId);
  if (!run) return;

  const acts = state.questData.acts || [];
  const lang: Language = state.settings.language || 'pt';

  const chevronDown = '<svg class="accordion-chevron" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const giftIcon = '<svg class="icon-svg-sm" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>';

  container.innerHTML = acts.map((act, index) => {
    const actNumber = index + 1;
    const stats = calculateActStats(run, actNumber);
    const actName = typeof act.actName === 'object' ? act.actName[lang] : act.actName;
    const isExpanded = state.expandedActs.has(actNumber);
    const quests = act.quests || [];

    const questsHtml = quests.map((quest: Quest) => {
      const isCompleted = run.completedQuests?.[quest.id] || false;
      const questName = typeof quest.name === 'object' ? quest.name[lang] : quest.name;
      const questZone = typeof quest.zone === 'object' ? quest.zone[lang] : quest.zone;
      const questReward = quest.reward ? (typeof quest.reward === 'object' ? quest.reward[lang] : quest.reward) : null;

      return `
        <div class="accordion-quest importance-${quest.importance || 'normal'} ${isCompleted ? 'completed' : ''}" data-quest-id="${quest.id}">
          <input type="checkbox"
                 class="checkbox accordion-quest-checkbox"
                 ${isCompleted ? 'checked' : ''}
                 data-quest-id="${quest.id}">
          <div class="accordion-quest-info">
            <div class="accordion-quest-name">${escapeHtml(questName)}</div>
            <div class="accordion-quest-zone">${escapeHtml(questZone)}</div>
          </div>
          ${questReward ? `<div class="accordion-quest-reward">${giftIcon}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="accordion-item ${isExpanded ? 'expanded' : ''}" data-act="${actNumber}">
        <div class="accordion-header" data-act="${actNumber}">
          ${chevronDown}
          <div class="accordion-title">${actName || `Ato ${actNumber}`}</div>
          <div class="accordion-progress-bars">
            <div class="accordion-progress-mini" title="Cr\u00edticas">
              <div class="accordion-progress-mini-fill critical" style="width: ${stats.critical.total > 0 ? (stats.critical.completed / stats.critical.total * 100) : 0}%"></div>
            </div>
            <div class="accordion-progress-mini" title="Importantes">
              <div class="accordion-progress-mini-fill important" style="width: ${stats.important.total > 0 ? (stats.important.completed / stats.important.total * 100) : 0}%"></div>
            </div>
            <div class="accordion-progress-mini" title="Opcionais">
              <div class="accordion-progress-mini-fill optional" style="width: ${stats.optional.total > 0 ? (stats.optional.completed / stats.optional.total * 100) : 0}%"></div>
            </div>
          </div>
          <div class="accordion-percent">${stats.percent}%</div>
        </div>
        <div class="accordion-content" style="${isExpanded ? '' : 'display: none;'}">
          <div class="accordion-stats">
            <span class="accordion-stat"><span class="stat-dot critical"></span> Cr\u00edticas: ${stats.critical.completed}/${stats.critical.total}</span>
            <span class="accordion-stat"><span class="stat-dot important"></span> Importantes: ${stats.important.completed}/${stats.important.total}</span>
            <span class="accordion-stat"><span class="stat-dot optional"></span> Opcionais: ${stats.optional.completed}/${stats.optional.total}</span>
          </div>
          <div class="accordion-quests">
            ${questsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers for accordion headers
  container.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const actNumber = parseInt((header as HTMLElement).dataset.act || '1');
      toggleActExpansion(actNumber);
    });
  });

  // Add checkbox handlers
  container.querySelectorAll('.accordion-quest-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    checkbox.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const questId = target.dataset.questId;
      const completed = target.checked;

      if (!questId) return;

      await ipcRenderer.invoke('update-quest-progress', {
        runId: state.activeRunId,
        questId,
        completed
      });

      state.runs = await ipcRenderer.invoke('get-runs');
      renderRunsList();
      renderAccordion();
    });
  });
}

// Render act progress overview
function renderActProgress(): void {
  const container = $('actProgressGrid');
  if (!container) return;

  const run = state.runs.find(r => r.id === state.activeRunId);
  if (!run) return;

  const acts = state.questData.acts || [];
  const lang: Language = state.settings.language || 'pt';

  container.innerHTML = acts.map((act, index) => {
    const actNumber = index + 1;
    const stats = calculateActStats(run, actNumber);
    const actName = typeof act.actName === 'object' ? act.actName[lang] : act.actName;
    const isCurrentAct = actNumber === state.currentAct;

    return `
      <div class="act-progress-card ${isCurrentAct ? 'active' : ''}" data-act="${actNumber}" style="cursor: pointer;">
        <div class="act-progress-card-header">
          <div class="act-progress-card-title">${actName || `Ato ${actNumber}`}</div>
          <div class="act-progress-card-percent">${stats.percent}%</div>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width: ${stats.percent}%"></div>
        </div>
        <div class="act-progress-card-stats">
          <div class="act-progress-stat">
            <div class="act-progress-stat-label">Total</div>
            <div class="act-progress-stat-value">${stats.completed}/${stats.total}</div>
          </div>
          <div class="act-progress-stat">
            <div class="act-progress-stat-label">Cr\u00edticas</div>
            <div class="act-progress-stat-value stat-critical">${stats.critical.completed}/${stats.critical.total}</div>
          </div>
          <div class="act-progress-stat">
            <div class="act-progress-stat-label">Importantes</div>
            <div class="act-progress-stat-value stat-important">${stats.important.completed}/${stats.important.total}</div>
          </div>
          <div class="act-progress-stat">
            <div class="act-progress-stat-label">Opcionais</div>
            <div class="act-progress-stat-value stat-optional">${stats.optional.completed}/${stats.optional.total}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.act-progress-card').forEach(card => {
    card.addEventListener('click', () => {
      const actNumber = parseInt((card as HTMLElement).dataset.act || '1');
      state.currentAct = actNumber;

      const actSelect = $('actSelect') as HTMLSelectElement | null;
      if (actSelect) {
        actSelect.value = String(actNumber);
      }

      renderActProgress();
      renderQuestsList();
    });
  });
}

// Render quests list
function renderQuestsList(): void {
  const container = $('questsList');
  if (!container) return;

  const run = state.runs.find(r => r.id === state.activeRunId);
  if (!run) return;

  const act = state.questData.acts?.[state.currentAct - 1];
  if (!act) {
    container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: var(--spacing-xl);">Nenhuma quest encontrada para este ato</p>';
    return;
  }

  const quests = act.quests || [];
  const lang: Language = state.settings.language || 'pt';

  container.innerHTML = quests.map((quest: Quest) => {
    const isCompleted = run.completedQuests?.[quest.id] || false;
    const questName = typeof quest.name === 'object' ? quest.name[lang] : quest.name;
    const questZone = typeof quest.zone === 'object' ? quest.zone[lang] : quest.zone;
    const questDesc = typeof quest.description === 'object' ? quest.description[lang] : quest.description;
    const questReward = quest.reward ? (typeof quest.reward === 'object' ? quest.reward[lang] : quest.reward) : null;

    return `
      <div class="quest-item importance-${quest.importance || 'normal'} ${isCompleted ? 'completed' : ''}" data-quest-id="${quest.id}">
        <input type="checkbox"
               class="checkbox quest-checkbox"
               ${isCompleted ? 'checked' : ''}
               data-quest-id="${quest.id}">
        <div class="quest-content">
          <div class="quest-header">
            <div>
              <div class="quest-name">${escapeHtml(questName)}</div>
              <div class="quest-zone">${escapeHtml(questZone)}</div>
            </div>
          </div>
          ${questDesc ? `<div class="quest-description">${escapeHtml(questDesc)}</div>` : ''}
          ${questReward ? `
            <div class="quest-reward">
              <span class="reward-icon"></span>
              ${escapeHtml(questReward)}
            </div>
          ` : ''}
          ${quest.tags && quest.tags.length > 0 ? `
            <div class="quest-tags">
              ${quest.tags.map(tag => `<span class="badge badge-normal">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Add checkbox handlers
  container.querySelectorAll('.quest-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const questId = target.dataset.questId;
      const completed = target.checked;

      if (!questId) return;

      await ipcRenderer.invoke('update-quest-progress', {
        runId: state.activeRunId,
        questId,
        completed
      });

      state.runs = await ipcRenderer.invoke('get-runs');
      renderRunsList();
      renderQuestsList();
      renderActProgress();
    });
  });
}

// Handle act change
function handleActChange(e: Event): void {
  const target = e.target as HTMLSelectElement;
  state.currentAct = parseInt(target.value);
  renderActProgress();
  renderQuestsList();
}

// Calculate run progress
function calculateRunProgress(run: Run): number {
  const totalQuests = state.questData.acts?.reduce((sum, act) => sum + (act.quests?.length || 0), 0) || 1;
  const completedQuests = Object.values(run.completedQuests || {}).filter(Boolean).length;
  return (completedQuests / totalQuests) * 100;
}

// Calculate act stats
function calculateActStats(run: Run, actNumber: number): ActStats {
  const act = state.questData.acts?.[actNumber - 1];
  const emptyStats = { total: 0, completed: 0, remaining: 0 };

  if (!act) {
    return { total: 0, completed: 0, percent: 0, critical: emptyStats, important: emptyStats, optional: emptyStats, required: emptyStats };
  }

  const quests = act.quests || [];
  const total = quests.length;
  const completed = quests.filter(q => run.completedQuests?.[q.id]).length;

  const critical = {
    total: quests.filter(q => q.importance === 'critical').length,
    completed: quests.filter(q => q.importance === 'critical' && run.completedQuests?.[q.id]).length,
    remaining: 0
  };
  critical.remaining = critical.total - critical.completed;

  const important = {
    total: quests.filter(q => q.importance === 'important').length,
    completed: quests.filter(q => q.importance === 'important' && run.completedQuests?.[q.id]).length,
    remaining: 0
  };
  important.remaining = important.total - important.completed;

  const optional = {
    total: quests.filter(q => q.importance === 'optional').length,
    completed: quests.filter(q => q.importance === 'optional' && run.completedQuests?.[q.id]).length,
    remaining: 0
  };
  optional.remaining = optional.total - optional.completed;

  const required = {
    total: quests.filter(q => !q.importance || q.importance === 'normal').length,
    completed: quests.filter(q => (!q.importance || q.importance === 'normal') && run.completedQuests?.[q.id]).length,
    remaining: 0
  };
  required.remaining = required.total - required.completed;

  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    critical,
    important,
    optional,
    required
  };
}

// Open run modal
function openRunModal(runId: string | null = null): void {
  state.editingRunId = runId;
  const modal = $('runModal');
  const title = $('runModalTitle');
  const nameInput = $('runNameInput') as HTMLInputElement | null;
  const classInput = $('runClassInput') as HTMLSelectElement | null;

  if (runId) {
    const run = state.runs.find(r => r.id === runId);
    if (run && title && nameInput && classInput) {
      title.textContent = 'Editar Personagem';
      nameInput.value = run.name;
      classInput.value = run.class;
    }
  } else if (title && nameInput && classInput) {
    title.textContent = 'Novo Personagem';
    nameInput.value = '';
    classInput.value = 'Warrior';
  }

  if (modal) {
    modal.style.display = 'flex';
  }
  nameInput?.focus();
}

// Close run modal
function closeRunModal(): void {
  const modal = $('runModal');
  if (modal) modal.style.display = 'none';
  state.editingRunId = null;
}

// Save run
async function saveRun(): Promise<void> {
  const nameInput = $('runNameInput') as HTMLInputElement | null;
  const classInput = $('runClassInput') as HTMLSelectElement | null;

  const name = nameInput?.value.trim() || '';
  const className = classInput?.value || 'Warrior';

  if (!name) {
    await showAlert('Campo obrigatório', 'Por favor, insira um nome para a run');
    return;
  }

  const existingRun = state.editingRunId ? state.runs.find(r => r.id === state.editingRunId) : null;

  const run: Run = {
    id: state.editingRunId || generateId(),
    name,
    class: className,
    createdAt: existingRun?.createdAt || Date.now(),
    completedQuests: existingRun?.completedQuests || {}
  };

  state.runs = await ipcRenderer.invoke('save-run', run);

  if (!state.editingRunId) {
    await selectRun(run.id);
  }

  renderRunsList();
  renderRunDetails();
  closeRunModal();
}

// Delete current run
async function deleteCurrentRun(): Promise<void> {
  if (!state.activeRunId) return;

  const run = state.runs.find(r => r.id === state.activeRunId);
  if (!run) return;

  const confirmed = await showConfirm('Excluir personagem', `Tem certeza que deseja excluir "${run.name}"?`);
  if (!confirmed) return;

  state.runs = await ipcRenderer.invoke('delete-run', state.activeRunId);
  state.activeRunId = null;
  await ipcRenderer.invoke('set-active-run', null);

  renderRunsList();
  renderRunDetails();
}

// Open settings modal
function openSettingsModal(): void {
  const modal = $('settingsModal');
  const langSelect = $('languageSelect') as HTMLSelectElement | null;
  const hotkeyInput = $('hotkeyInput') as HTMLInputElement | null;
  const opacitySlider = $('opacitySlider') as HTMLInputElement | null;
  const opacityValue = $('opacityValue');

  if (langSelect) langSelect.value = state.settings.language || 'pt';
  if (hotkeyInput) hotkeyInput.value = state.settings.overlayHotkey || 'Alt+F';
  if (opacitySlider) opacitySlider.value = String((state.settings.overlayOpacity || 0.9) * 100);
  if (opacityValue) opacityValue.textContent = `${Math.round(parseFloat(opacitySlider?.value || '90'))}%`;

  if (modal) modal.style.display = 'flex';
}

// Close settings modal
function closeSettingsModal(): void {
  const modal = $('settingsModal');
  if (modal) modal.style.display = 'none';
}

// Handle opacity change - real-time update
async function handleOpacityChange(e: Event): Promise<void> {
  const target = e.target as HTMLInputElement;
  const value = parseInt(target.value);
  const opacityValue = $('opacityValue');

  if (opacityValue) opacityValue.textContent = `${value}%`;

  await ipcRenderer.invoke('update-opacity-realtime', value / 100);
}

// Save settings
async function saveSettings(): Promise<void> {
  const langSelect = $('languageSelect') as HTMLSelectElement | null;
  const hotkeyInput = $('hotkeyInput') as HTMLInputElement | null;
  const opacitySlider = $('opacitySlider') as HTMLInputElement | null;

  const oldLanguage = state.settings.language || 'pt';
  const newLanguage = (langSelect?.value || 'pt') as 'pt' | 'en';

  const settings: Settings = {
    ...state.settings,
    language: newLanguage,
    overlayHotkey: hotkeyInput?.value || 'Alt+F',
    overlayOpacity: (parseInt(opacitySlider?.value || '90')) / 100
  };

  state.settings = await ipcRenderer.invoke('save-settings', settings);
  closeSettingsModal();

  if (oldLanguage !== newLanguage) {
    await ipcRenderer.invoke('reload-windows');
  } else {
    renderQuestsList();
    renderActProgress();
  }
}

// Reset run progress
async function resetRunProgress(): Promise<void> {
  if (!state.activeRunId) return;

  const run = state.runs.find(r => r.id === state.activeRunId);
  if (!run) return;

  const confirmed1 = await showConfirm(
    'Resetar progresso',
    `Tem certeza que deseja RESETAR TODO O PROGRESSO de "${run.name}"?\n\nEsta ação não pode ser desfeita!`
  );
  if (!confirmed1) return;

  const confirmed2 = await showConfirm(
    'Confirmar reset',
    'Confirma novamente? Todo o progresso será perdido!'
  );
  if (!confirmed2) return;

  await ipcRenderer.invoke('reset-run-progress', state.activeRunId);

  state.runs = await ipcRenderer.invoke('get-runs');
  renderRunsList();
  renderRunDetails();

  await showAlert('Sucesso', 'Progresso resetado com sucesso!');
}

// Custom modal functions
function showAlert(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'custom-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
      <h3 class="custom-modal-title">${escapeHtml(title)}</h3>
      <p class="custom-modal-message">${escapeHtml(message)}</p>
      <div class="custom-modal-actions">
        <button class="btn btn-primary custom-modal-btn-confirm">OK</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const confirmBtn = modal.querySelector('.custom-modal-btn-confirm') as HTMLButtonElement;
    confirmBtn.addEventListener('click', () => {
      backdrop.remove();
      resolve();
    });
  });
}

function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'custom-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
      <h3 class="custom-modal-title">${escapeHtml(title)}</h3>
      <p class="custom-modal-message">${escapeHtml(message)}</p>
      <div class="custom-modal-actions">
        <button class="btn btn-secondary custom-modal-btn-cancel">Cancelar</button>
        <button class="btn btn-primary custom-modal-btn-confirm">Confirmar</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const cancelBtn = modal.querySelector('.custom-modal-btn-cancel') as HTMLButtonElement;
    const confirmBtn = modal.querySelector('.custom-modal-btn-confirm') as HTMLButtonElement;

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
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);

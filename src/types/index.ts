// Tipos principais do POE2 Campaign Overlay

export type Language = 'pt' | 'en';

export interface LocalizedString {
  pt: string;
  en: string;
}

export type QuestImportance = 'normal' | 'important' | 'critical' | 'optional' | 'unique';

export interface Quest {
  id: string;
  name: LocalizedString;
  zone: LocalizedString;
  description: LocalizedString;
  reward: LocalizedString | null;
  importance: QuestImportance;
  tags: string[];
}

export interface Act {
  actNumber: number;
  actName: LocalizedString;
  quests: Quest[];
}

export interface QuestData {
  acts: Act[];
}

export interface Run {
  id: string;
  name: string;
  class: string;
  createdAt: number;
  completedQuests: Record<string, boolean>;
  timerElapsed?: number;
}

export interface OverlayPosition {
  x: number;
  y: number;
}

export interface Settings {
  language: Language;
  overlayHotkey: string;
  overlayOpacity: number;
  overlayWidth: number;
  overlayHeight: number;
  overlayPosition: OverlayPosition;
  skippedQuests: Record<string, string[]>;
}

export interface StoreData {
  runs: Run[];
  activeRun: string | null;
  settings: Settings;
}

// Stats calculados
export interface QuestStats {
  total: number;
  completed: number;
  remaining: number;
}

export interface ActStats {
  total: number;
  completed: number;
  percent: number;
  critical: QuestStats;
  important: QuestStats;
  optional: QuestStats;
  required: QuestStats;
}

// Timer state
export interface TimerState {
  elapsed: number;
  running: boolean;
  interval: ReturnType<typeof setInterval> | null;
  startTime: number | null;
}

// IPC Event payloads
export interface QuestProgressPayload {
  runId: string;
  questId: string;
  completed: boolean;
}

export interface SkipQuestPayload {
  runId: string;
  questId: string;
}

import { DEFAULT_LIBRARY, DEFAULT_PROMPT_TEMPLATES, DEFAULT_USERS } from '../data/library';
import { DEFAULT_THREAD_PALETTE } from '../data/threadPalette';
import type {
  AuthSession,
  PatternLibraryItem,
  PromptTemplates,
  SavedProject,
  ThreadColor,
  UserAccount,
} from '../types';

const STORAGE_KEYS = {
  users: 'xilankapu:users',
  session: 'xilankapu:session',
  library: 'xilankapu:library',
  threadPalette: 'xilankapu:threadPalette',
  templates: 'xilankapu:templates',
  projects: 'xilankapu:projects',
  favorites: 'xilankapu:favorites',
};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Failed to parse storage key ${key}:`, error);
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function seedStorage() {
  if (!canUseStorage()) {
    return;
  }

  if (!window.localStorage.getItem(STORAGE_KEYS.users)) {
    writeJson(STORAGE_KEYS.users, DEFAULT_USERS);
  }
  if (!window.localStorage.getItem(STORAGE_KEYS.library)) {
    writeJson(STORAGE_KEYS.library, DEFAULT_LIBRARY);
  }
  if (!window.localStorage.getItem(STORAGE_KEYS.threadPalette)) {
    writeJson(STORAGE_KEYS.threadPalette, DEFAULT_THREAD_PALETTE);
  }
  if (!window.localStorage.getItem(STORAGE_KEYS.templates)) {
    writeJson(STORAGE_KEYS.templates, DEFAULT_PROMPT_TEMPLATES);
  }
  if (!window.localStorage.getItem(STORAGE_KEYS.projects)) {
    writeJson<SavedProject[]>(STORAGE_KEYS.projects, []);
  }
  if (!window.localStorage.getItem(STORAGE_KEYS.favorites)) {
    writeJson<string[]>(STORAGE_KEYS.favorites, []);
  }
}

export function getUsers() {
  return readJson<UserAccount[]>(STORAGE_KEYS.users, DEFAULT_USERS);
}

export function saveUsers(users: UserAccount[]) {
  writeJson(STORAGE_KEYS.users, users);
}

export function getLibraryItems() {
  return readJson<PatternLibraryItem[]>(STORAGE_KEYS.library, DEFAULT_LIBRARY);
}

export function saveLibraryItems(items: PatternLibraryItem[]) {
  writeJson(STORAGE_KEYS.library, items);
}

export function getThreadPalette() {
  return readJson<ThreadColor[]>(STORAGE_KEYS.threadPalette, DEFAULT_THREAD_PALETTE);
}

export function saveThreadPalette(colors: ThreadColor[]) {
  writeJson(STORAGE_KEYS.threadPalette, colors);
}

export function getPromptTemplates() {
  return {
    ...DEFAULT_PROMPT_TEMPLATES,
    ...readJson<PromptTemplates>(STORAGE_KEYS.templates, DEFAULT_PROMPT_TEMPLATES),
  };
}

export function savePromptTemplates(templates: PromptTemplates) {
  writeJson(STORAGE_KEYS.templates, templates);
}

export function getProjects() {
  return readJson<SavedProject[]>(STORAGE_KEYS.projects, []);
}

export function saveProjects(projects: SavedProject[]) {
  writeJson(STORAGE_KEYS.projects, projects);
}

export function getCurrentSession() {
  return readJson<AuthSession | null>(STORAGE_KEYS.session, null);
}

export function setCurrentSession(session: AuthSession | null) {
  if (!canUseStorage()) {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(STORAGE_KEYS.session);
    return;
  }
  writeJson(STORAGE_KEYS.session, session);
}

export function getFavoriteCandidateIds() {
  return new Set(readJson<string[]>(STORAGE_KEYS.favorites, []));
}

export function toggleFavoriteCandidate(candidateId: string) {
  const favorites = getFavoriteCandidateIds();
  if (favorites.has(candidateId)) {
    favorites.delete(candidateId);
  } else {
    favorites.add(candidateId);
  }
  writeJson(STORAGE_KEYS.favorites, Array.from(favorites));
  return favorites;
}

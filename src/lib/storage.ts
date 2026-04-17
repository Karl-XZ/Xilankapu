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

const GUEST_SESSION: AuthSession = {
  userId: 'guest-local',
  username: 'guest',
  displayName: '本地模式',
  role: 'user',
};

const memoryStore: {
  users: UserAccount[];
  session: AuthSession | null;
  library: PatternLibraryItem[];
  threadPalette: ThreadColor[];
  templates: PromptTemplates;
  projects: SavedProject[];
  favorites: string[];
} = {
  users: [...DEFAULT_USERS],
  session: { ...GUEST_SESSION },
  library: [...DEFAULT_LIBRARY],
  threadPalette: [...DEFAULT_THREAD_PALETTE],
  templates: { ...DEFAULT_PROMPT_TEMPLATES },
  projects: [],
  favorites: [],
};

export function seedStorage() {
  memoryStore.users = [...DEFAULT_USERS];
  memoryStore.session = { ...GUEST_SESSION };
  memoryStore.library = [...DEFAULT_LIBRARY];
  memoryStore.threadPalette = [...DEFAULT_THREAD_PALETTE];
  memoryStore.templates = { ...DEFAULT_PROMPT_TEMPLATES };
  memoryStore.projects = [];
  memoryStore.favorites = [];
}

export function getUsers() {
  return [...memoryStore.users];
}

export function saveUsers(users: UserAccount[]) {
  memoryStore.users = [...users];
}

export function getLibraryItems() {
  return [...memoryStore.library];
}

export function saveLibraryItems(items: PatternLibraryItem[]) {
  memoryStore.library = [...items];
}

export function getThreadPalette() {
  return [...memoryStore.threadPalette];
}

export function saveThreadPalette(colors: ThreadColor[]) {
  memoryStore.threadPalette = [...colors];
}

export function getPromptTemplates() {
  return {
    ...DEFAULT_PROMPT_TEMPLATES,
    ...memoryStore.templates,
  };
}

export function savePromptTemplates(templates: PromptTemplates) {
  memoryStore.templates = { ...templates };
}

export function getProjects() {
  return [...memoryStore.projects];
}

export function saveProjects(projects: SavedProject[]) {
  memoryStore.projects = [...projects];
}

export function getCurrentSession() {
  return memoryStore.session ? { ...memoryStore.session } : { ...GUEST_SESSION };
}

export function setCurrentSession(session: AuthSession | null) {
  memoryStore.session = session ? { ...session } : { ...GUEST_SESSION };
}

export function getFavoriteCandidateIds() {
  return new Set(memoryStore.favorites);
}

export function toggleFavoriteCandidate(candidateId: string) {
  const favorites = new Set(memoryStore.favorites);
  if (favorites.has(candidateId)) {
    favorites.delete(candidateId);
  } else {
    favorites.add(candidateId);
  }
  memoryStore.favorites = Array.from(favorites);
  return favorites;
}

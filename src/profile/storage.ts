import type { BodyProfile } from '../types';
import type { Unit } from './profile';

const PROFILE_KEY = 'profile';
const UNIT_KEY = 'unit';

export async function loadProfile(): Promise<BodyProfile | null> {
  const r = await chrome.storage.local.get(PROFILE_KEY);
  return (r[PROFILE_KEY] as BodyProfile | undefined) ?? null;
}

export const saveProfile = (p: BodyProfile) => chrome.storage.local.set({ [PROFILE_KEY]: p });
export const clearProfile = () => chrome.storage.local.remove(PROFILE_KEY);

export async function loadUnit(): Promise<Unit> {
  const r = await chrome.storage.local.get(UNIT_KEY);
  return r[UNIT_KEY] === 'in' ? 'in' : 'cm';
}

export const saveUnit = (u: Unit) => chrome.storage.local.set({ [UNIT_KEY]: u });

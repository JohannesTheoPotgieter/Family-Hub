import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHttpError } from './security.mjs';

const EMPTY_SERVER_STATE = Object.freeze({ providers: {}, icsSubscriptions: [] });
const cloneEmptyServerState = () => ({ providers: {}, icsSubscriptions: [] });

export const createServerStorage = ({ dataFile, encKey }) => {
  const requireEncKey = () => {
    if (!encKey) throw createHttpError(500, 'TOKEN_ENC_KEY must be set to at least 32 characters before connecting Google or Outlook.');
    return encKey;
  };

  const loadPersistedState = () => {
    if (!existsSync(dataFile)) return cloneEmptyServerState();
    try {
      const parsed = JSON.parse(readFileSync(dataFile, 'utf8'));
      return {
        providers: parsed?.providers && typeof parsed.providers === 'object' ? parsed.providers : {},
        icsSubscriptions: Array.isArray(parsed?.icsSubscriptions) ? parsed.icsSubscriptions : []
      };
    } catch {
      // Keep boot read-only: malformed storage must not be auto-repaired or rewritten during startup.
      return cloneEmptyServerState();
    }
  };

  const persistedState = loadPersistedState();
  const savePersistedState = () => writeFileSync(dataFile, JSON.stringify(persistedState, null, 2));
  const encrypt = (raw) => {
    const key = requireEncKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  };
  const decrypt = (value) => {
    if (!value) return null;
    const key = requireEncKey();
    const raw = Buffer.from(value, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  };

  const getStoredProviderAccount = (provider) => persistedState.providers[provider] ?? null;
  const saveProviderAccount = (provider, tokens) => {
    const current = getStoredProviderAccount(provider) ?? {};
    persistedState.providers[provider] = { ...current, ...tokens, connectedAtIso: new Date().toISOString() };
    savePersistedState();
  };
  const clearProviderAccount = (provider) => {
    delete persistedState.providers[provider];
    savePersistedState();
  };
  const addIcsSubscription = (subscription) => {
    persistedState.icsSubscriptions.push(subscription);
    savePersistedState();
  };
  const removeIcsSubscription = (subscriptionId) => {
    const index = persistedState.icsSubscriptions.findIndex((item) => item.id === subscriptionId);
    if (index < 0) return false;
    persistedState.icsSubscriptions.splice(index, 1);
    savePersistedState();
    return true;
  };
  const reset = () => {
    persistedState.providers = {};
    persistedState.icsSubscriptions = [];
    savePersistedState();
  };

  return { dataFile: resolve(dataFile), emptyState: EMPTY_SERVER_STATE, persistedState, requireEncKey, encrypt, decrypt, savePersistedState, getStoredProviderAccount, saveProviderAccount, clearProviderAccount, addIcsSubscription, removeIcsSubscription, reset };
};

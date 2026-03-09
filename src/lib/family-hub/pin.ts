import type { UserId } from './constants';

export type PinStore = Partial<Record<UserId, string>>;

const PEPPER = 'family-hub-local-v1';

export const encodePin = (userId: UserId, pin: string) => btoa(`${PEPPER}:${userId}:${pin}`);

export const verifyPin = (userId: UserId, pin: string, stored?: string) => {
  if (!stored) return false;
  return encodePin(userId, pin) === stored;
};

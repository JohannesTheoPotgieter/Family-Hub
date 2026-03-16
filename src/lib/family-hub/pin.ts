import type { UserId } from './constants';

export type PinStore = Partial<Record<UserId, string>>;

const PEPPER = 'family-hub-local-v2';
const ITERATIONS = 120_000;
const encoder = new TextEncoder();

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const derivePinHash = async (userId: UserId, pin: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(`${PEPPER}:${userId}`),
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
};

export const encodePin = (userId: UserId, pin: string) => derivePinHash(userId, pin);

export const verifyPin = async (userId: UserId, pin: string, stored?: string) => {
  if (!stored) return false;
  return (await encodePin(userId, pin)) === stored;
};

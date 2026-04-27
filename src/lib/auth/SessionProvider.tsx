// Session context (Phase 0 client wiring).
//
// Two responsibilities:
//   1. Lazy-load Clerk's frontend SDK after we have the publishable key
//      from /api/public-config. We never bake the key in at build time.
//   2. Once Clerk reports an active session, configure the API client's
//      token getter and call /api/me to hydrate the entitlement snapshot
//      + member payload, then expose them via context.
//
// In dev / local-first prototype mode (Clerk not configured), the
// provider yields a "guest" session so the existing app keeps running.
// New, auth-only code paths gate on `useSession().isAuthenticated`.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import {
  configureApiClient,
  fetchMe,
  fetchPublicConfig,
  type SessionPayload
} from '../api/client.ts';
import { setEntitlements } from '../../hooks/useEntitlement.ts';
import { connectRealtime, type RealtimeEvent } from '../realtime/client.ts';

type ClerkBundle = typeof import('@clerk/clerk-react');

type SessionStatus =
  | { kind: 'loading' }
  | { kind: 'guest'; reason: 'clerk_not_configured' | 'signed_out' }
  | { kind: 'authenticated'; session: SessionPayload };

type SessionContextValue = SessionStatus & {
  refresh: () => Promise<void>;
};

const Ctx = createContext<SessionContextValue | null>(null);

export const useSession = (): SessionContextValue => {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
};

let clerkBundle: ClerkBundle | null = null;
const loadClerk = async (): Promise<ClerkBundle> => {
  if (clerkBundle) return clerkBundle;
  // Code-split: only fetch the Clerk SDK when a publishable key is
  // present. Free + offline dev pays nothing for it.
  clerkBundle = await import('@clerk/clerk-react');
  return clerkBundle;
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<SessionStatus>({ kind: 'loading' });
  const [bootstrap, setBootstrap] = useState<{
    clerkPublishableKey: string | null;
    Provider: ClerkBundle['ClerkProvider'] | null;
  }>({ clerkPublishableKey: null, Provider: null });

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      setEntitlements(me.entitlements);
      setStatus({ kind: 'authenticated', session: me });
      // Consume family key from invite-acceptance fragment if present.
      // libsodium is heavy — code-split via dynamic import so guests +
      // returning members who already have the key in IndexedDB never
      // pay for it on first paint.
      if (typeof window !== 'undefined' && window.location.hash.includes('fkey=')) {
        import('../crypto/familyKey.ts')
          .then(({ consumeFamilyKeyFromUrl }) => consumeFamilyKeyFromUrl(me.member.familyId))
          .catch(() => {});
      }
    } catch (err) {
      // 401 / network → fall back to guest. Caller can re-trigger after
      // signing in.
      setStatus({ kind: 'guest', reason: 'signed_out' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const config = await fetchPublicConfig().catch(() => null);
      if (cancelled) return;

      if (!config?.clerkPublishableKey) {
        setStatus({ kind: 'guest', reason: 'clerk_not_configured' });
        return;
      }

      const { ClerkProvider } = await loadClerk();
      if (cancelled) return;
      setBootstrap({ clerkPublishableKey: config.clerkPublishableKey, Provider: ClerkProvider });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Open the SSE stream once we're authenticated. The client minted ticket
  // via /api/v2/realtime/ticket inside connectRealtime; auth resolution
  // happens through the same API client + Clerk bearer.
  useEffect(() => {
    if (status.kind !== 'authenticated') return;
    const onEvent = (event: RealtimeEvent) => {
      // Re-broadcast on a window event so feature stores can listen
      // without each importing the realtime module directly. Phase 5
      // ThreadView reads this stream to flip proposal cards live.
      window.dispatchEvent(new CustomEvent('familyhub:realtime', { detail: event }));
    };
    const disconnect = connectRealtime(onEvent);
    return disconnect;
  }, [status.kind, status.kind === 'authenticated' ? status.session.member.id : null]);

  const value = useMemo<SessionContextValue>(() => ({ ...status, refresh }), [status, refresh]);

  if (!bootstrap.Provider || !bootstrap.clerkPublishableKey) {
    // Either still loading config or Clerk isn't configured (guest mode).
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  const ClerkProvider = bootstrap.Provider;
  return (
    <ClerkProvider
      publishableKey={bootstrap.clerkPublishableKey}
      // Disable the default redirect; the app renders its own sign-in UI
      // inline so the family-hub shell stays in view.
      afterSignInUrl="/"
      afterSignUpUrl="/"
    >
      <Ctx.Provider value={value}>
        <ClerkSessionBridge onResolved={refresh} />
        {children}
      </Ctx.Provider>
    </ClerkProvider>
  );
};

// Hooks-only child: lives under <ClerkProvider> so useAuth works. Wires
// the API client's token getter to Clerk and triggers /api/me hydration
// each time the session id changes.
const ClerkSessionBridge = ({ onResolved }: { onResolved: () => Promise<void> }) => {
  // Lazy require so non-Clerk environments don't pay the import cost.
  const auth = clerkBundle!.useAuth();
  useEffect(() => {
    configureApiClient({ getToken: () => auth.getToken() });
  }, [auth]);

  useEffect(() => {
    if (!auth.isLoaded) return;
    if (auth.isSignedIn) {
      onResolved();
    }
  }, [auth.isLoaded, auth.isSignedIn, auth.sessionId, onResolved]);

  return null;
};

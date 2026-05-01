// Auth gate (Tier 1 / Replit dev work).
//
// Branches at the top of the app:
//   - loading             → loading screen
//   - clerk_not_configured → render children (prototype dev mode)
//   - signed_out           → render Clerk's <SignIn> / <SignUp>
//   - authenticated        → render children (server-backed UI lights up)
//
// Clerk components are lazy-loaded via the same dynamic import the
// SessionProvider uses, so first paint stays cheap when no key is set.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '../../lib/auth/SessionProvider';
import { fetchPublicConfig, type PublicConfig } from '../../lib/api/client';

type ClerkComponents = {
  SignIn: typeof import('@clerk/clerk-react').SignIn;
  SignUp: typeof import('@clerk/clerk-react').SignUp;
};

let cachedClerkUi: ClerkComponents | null = null;
const loadClerkUi = async (): Promise<ClerkComponents> => {
  if (cachedClerkUi) return cachedClerkUi;
  const mod = await import('@clerk/clerk-react');
  cachedClerkUi = { SignIn: mod.SignIn, SignUp: mod.SignUp };
  return cachedClerkUi;
};

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const session = useSession();
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    fetchPublicConfig()
      .then(setConfig)
      .catch(() => setConfig({ clerkPublishableKey: null, vapidPublicKey: null, stripePublishableKey: null, publicAppUrl: null }));
  }, []);

  // Loading the public config or the session itself.
  if (session.kind === 'loading' || config == null) {
    return <FullPageMessage message="Loading…" />;
  }

  // Clerk not configured (no publishable key) → prototype dev mode.
  if (!config.clerkPublishableKey) {
    return <>{children}</>;
  }

  // Authenticated → app renders, server panels light up.
  if (session.kind === 'authenticated') {
    return <>{children}</>;
  }

  // Signed out + Clerk configured → show Clerk's sign-in flow.
  return <SignInPage />;
};

const FullPageMessage = ({ message }: { message: string }) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fdfbf6',
      color: '#1a1a1a',
      fontFamily: 'system-ui, sans-serif'
    }}
  >
    {message}
  </div>
);

const SignInPage = () => {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [Components, setComponents] = useState<ClerkComponents | null>(null);

  useEffect(() => {
    loadClerkUi().then(setComponents).catch(() => setComponents(null));
  }, []);

  const heading = useMemo(
    () => (mode === 'sign-in' ? 'Sign in to Family-Hub' : 'Create your family'),
    [mode]
  );
  const switchCopy = useMemo(
    () => (mode === 'sign-in' ? 'New here? Create a family →' : 'Already have an account? Sign in'),
    [mode]
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #fdfbf6 0%, #f4eddf 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        color: '#1a1a1a'
      }}
    >
      <header style={{ marginBottom: 32, textAlign: 'center', maxWidth: 480 }}>
        <h1 style={{ fontSize: 32, margin: '0 0 8px', letterSpacing: -0.5 }}>Family-Hub</h1>
        <p style={{ margin: 0, fontSize: 16, opacity: 0.75, lineHeight: 1.45 }}>
          Plans that stick. What you wish WhatsApp remembered.
        </p>
      </header>

      <section
        aria-label={heading}
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 6px 32px rgba(0,0,0,0.08)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        <h2 style={{ fontSize: 18, margin: 0 }}>{heading}</h2>

        {Components ? (
          mode === 'sign-in' ? (
            <Components.SignIn signUpUrl="?signup=1" routing="virtual" />
          ) : (
            <Components.SignUp signInUrl="?signup=0" routing="virtual" />
          )
        ) : (
          <div style={{ padding: 12, opacity: 0.7, fontSize: 13 }}>Loading sign-in…</div>
        )}

        <button
          type="button"
          onClick={() => setMode((current) => (current === 'sign-in' ? 'sign-up' : 'sign-in'))}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#1a1a1a',
            cursor: 'pointer',
            fontSize: 14,
            textDecoration: 'underline'
          }}
        >
          {switchCopy}
        </button>
      </section>

      <footer style={{ marginTop: 24, fontSize: 12, opacity: 0.6, textAlign: 'center', maxWidth: 420 }}>
        By continuing you accept Family-Hub's Terms and Privacy Notice (POPIA).
      </footer>
    </div>
  );
};

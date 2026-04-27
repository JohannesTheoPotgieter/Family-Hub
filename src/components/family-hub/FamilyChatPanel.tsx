// FamilyChatPanel — surfaces the family thread inline so MoreScreen can
// host the chat experience without a navigation overhaul. Picks the
// `kind === 'family'` thread from the visible list.

import { useMemo } from 'react';
import { useSession } from '../../lib/auth/SessionProvider.tsx';
import { useThreads } from '../../hooks/useThreads.ts';
import { ThreadView } from './chat/ThreadView.tsx';

export const FamilyChatPanel = () => {
  const session = useSession();
  const enabled = session.kind === 'authenticated';
  const threads = useThreads({ enabled });

  const familyThread = useMemo(() => {
    if (threads.kind !== 'ready') return null;
    return threads.threads.find((t) => t.kind === 'family') ?? null;
  }, [threads]);

  if (!enabled) return null;
  if (threads.kind === 'loading') return null;
  if (threads.kind === 'guest') return null;
  if (threads.kind === 'error') return null;
  if (!familyThread) return null;

  return (
    <section style={{ marginBottom: 16 }}>
      <ThreadView thread={familyThread} />
    </section>
  );
};

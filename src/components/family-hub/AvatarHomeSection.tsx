import { useMemo, useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';
import type { AvatarGameState } from '../../domain/avatarTypes';
import { AvatarFallback2D } from '../../avatar3d/AvatarFallback2D';
import { AvatarScene } from '../../avatar3d/AvatarScene';
import { shouldUseAvatarFallback } from '../../domain/avatarRuntime';

type CareAction = 'feed' | 'play' | 'clean' | 'rest' | 'pet' | 'story';

type Props = {
  users: User[];
  activeUserId: UserId | null;
  avatarGame: AvatarGameState;
  onCareAction: (userId: UserId, action: CareAction) => void;
};

const use3DAvailability = () => {
  const [reducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const webglSupported = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }, []);
  return { reducedMotion, webglSupported };
};

export const AvatarHomeSection = ({ users, activeUserId, avatarGame, onCareAction }: Props) => {
  const [tab, setTab] = useState<'companion' | 'squad' | 'rewards' | 'progress' | 'challenges'>('companion');
  const selectedId = activeUserId ?? users[0].id;
  const companion = avatarGame.companionsByUserId[selectedId];
  const { reducedMotion, webglSupported } = use3DAvailability();

  const lowPowerMode = ((navigator as any).deviceMemory ?? 8) <= 2;
  const useFallback = shouldUseAvatarFallback(webglSupported, reducedMotion, lowPowerMode);

  return (
    <section className="stack avatar-home">
      <div className="more-tab-row">
        {(['companion', 'squad', 'rewards', 'progress', 'challenges'] as const).map((item) => (
          <button key={item} className={`more-tab ${tab === item ? 'is-selected' : ''}`} type="button" onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>

      {tab === 'companion' ? (
        <article className="glass-panel stack-sm">
          <div className="section-head"><h3>My Companion</h3><span className="route-pill">Mood: {companion.mood}</span></div>
          {!useFallback ? <AvatarScene companion={companion} reducedMotion={reducedMotion} /> : <AvatarFallback2D companion={companion} />}
          <p className="muted">Level {companion.level} · XP {companion.xp}/100 · Stage {companion.growthStage}</p>
          <div className="foundation-grid">
            {Object.entries(companion.stats).map(([key, value]) => (
              <label key={key} className="stack-sm">
                <span className="eyebrow">{key}</span>
                <progress max={100} value={value} aria-label={`${key} ${Math.round(value)}`} />
              </label>
            ))}
          </div>
          <div className="quick-actions" role="group" aria-label="Care actions">
            {(['feed', 'play', 'clean', 'rest', 'pet', 'story'] as CareAction[]).map((action) => (
              <button key={action} type="button" className="chip-action" onClick={() => onCareAction(selectedId, action)}>{action}</button>
            ))}
          </div>
          <p className="status-banner is-success">Complete 1 more task to cheer up your companion.</p>
        </article>
      ) : null}

      {tab === 'squad' ? <article className="glass-panel stack-sm"><h3>Family Squad</h3><p className="muted">The whole household is making progress.</p><div className="avatar-row">{users.map((u) => <span className="route-pill" key={u.id}>{u.name}: Lv {avatarGame.companionsByUserId[u.id].level}</span>)}</div><p>Family stars: {avatarGame.familyRewardTrack.familyStars}</p></article> : null}

      {tab === 'rewards' ? <article className="glass-panel stack-sm"><h3>Rewards / Closet</h3><div className="chip-list">{companion.inventory.outfits.map((i) => <span key={i} className="route-pill">{i}</span>)}{companion.inventory.accessories.map((i) => <span key={i} className="route-pill">{i}</span>)}{companion.inventory.roomDecor.map((i) => <span key={i} className="route-pill">{i}</span>)}</div></article> : null}

      {tab === 'progress' ? <article className="glass-panel stack-sm"><h3>Progress</h3><p className="muted">Streak: {companion.streakDays} days · Household actions: {companion.completedHouseholdActions}</p><div className="chip-list">{avatarGame.rewardHistory.slice(0, 6).map((item) => <span key={item.id} className="route-pill">{item.label}</span>)}</div></article> : null}

      {tab === 'challenges' ? <article className="glass-panel stack-sm"><h3>Family Challenges</h3>{avatarGame.familyChallenges.map((challenge) => <div key={challenge.id} className="challenge-card"><p><strong>{challenge.title}</strong></p><p className="muted">{challenge.description}</p><progress max={challenge.targetValue} value={challenge.progressValue} aria-label={`${challenge.title} progress`} /><p className="muted">{challenge.progressValue}/{challenge.targetValue} · {challenge.completed ? 'Challenge complete!' : 'One more shared task unlocks a moon lamp.'}</p></div>)}</article> : null}
    </section>
  );
};

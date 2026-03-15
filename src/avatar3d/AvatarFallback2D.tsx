import type { AvatarCompanion } from '../domain/avatarTypes';

export const AvatarFallback2D = ({ companion }: { companion: AvatarCompanion }) => (
  <article className="avatar-fallback-card">
    <div className="avatar-fallback-body" style={{ background: `radial-gradient(circle at 20% 20%, #fff, ${companion.appearance.bodyColor})` }}>
      <span className="avatar-fallback-face">◕ ◕</span>
    </div>
    <p className="muted">2D companion mode enabled for comfort/performance.</p>
  </article>
);

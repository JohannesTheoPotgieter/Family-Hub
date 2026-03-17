import type { CSSProperties } from 'react';
import type { AvatarCompanion } from '../domain/avatarTypes';

export const AvatarFallback2D = ({ companion }: { companion: AvatarCompanion }) => {
  const style = {
    '--fur-color': companion.appearance.bodyColor,
    '--accent-color': companion.appearance.auraColor ?? '#ffe39a'
  } as CSSProperties;

  return (
    <article className="avatar-fallback-card" style={style}>
      <div className="avatar-fallback-body">
        <div className="avatar-fallback-tail" aria-hidden="true" />
        <div className="avatar-fallback-head" aria-hidden="true">
          <span className="avatar-ear left" />
          <span className="avatar-ear right" />
          <span className="avatar-helmet">
            <span className="avatar-helmet-badge" />
          </span>
          <span className="avatar-face">
            <span className="avatar-eye left" />
            <span className="avatar-eye right" />
            <span className="avatar-blush left" />
            <span className="avatar-blush right" />
            <span className="avatar-muzzle">
              <span className="avatar-nose" />
              <span className="avatar-mouth" />
            </span>
          </span>
        </div>
        <div className="avatar-fallback-torso" aria-hidden="true">
          <span className="avatar-backpack" />
          <span className="avatar-chest" />
          <span className="avatar-collar">
            <span className="avatar-badge" />
          </span>
          <span className="avatar-fallback-paw left" />
          <span className="avatar-fallback-paw right" />
        </div>
      </div>
      <p className="muted">2D companion mode enabled for comfort/performance.</p>
    </article>
  );
};

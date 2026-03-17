import type { CSSProperties } from 'react';
import type { AvatarCompanion } from '../domain/avatarTypes';
import type { AvatarAnimation } from './AvatarAnimations';

type Props = { companion: AvatarCompanion; animation: AvatarAnimation; onReact?: (reaction: AvatarAnimation) => void };

export const AvatarModel = ({ companion, animation, onReact }: Props) => {
  const style = {
    '--fur-color': companion.appearance.bodyColor,
    '--accent-color': companion.appearance.auraColor ?? '#ffe39a'
  } as CSSProperties;

  return (
    <div className={`avatar-3d-figure is-${animation}`} style={style}>
      <div className="avatar-shadow" aria-hidden="true" />
      <div className="avatar-tail" aria-hidden="true" />

      <button type="button" className="avatar-part head" onClick={() => onReact?.('wave')} aria-label="Tap head for wave">
        <span className="avatar-ear left" aria-hidden="true" />
        <span className="avatar-ear right" aria-hidden="true" />
        <span className="avatar-helmet" aria-hidden="true">
          <span className="avatar-helmet-badge" />
        </span>
        <span className="avatar-face" aria-hidden="true">
          <span className="avatar-eye left" />
          <span className="avatar-eye right" />
          <span className="avatar-blush left" />
          <span className="avatar-blush right" />
          <span className="avatar-muzzle">
            <span className="avatar-nose" />
            <span className="avatar-mouth" />
          </span>
        </span>
      </button>

      <button type="button" className="avatar-part torso" onClick={() => onReact?.('happyJump')} aria-label="Tap belly for laugh">
        <span className="avatar-backpack" aria-hidden="true" />
        <span className="avatar-chest" aria-hidden="true" />
        <span className="avatar-collar" aria-hidden="true">
          <span className="avatar-badge" />
        </span>
      </button>

      <button type="button" className="avatar-part arm left" onClick={() => onReact?.('wave')} aria-label="Tap paw for high five">
        <span className="avatar-paw-pad" aria-hidden="true" />
      </button>
      <button type="button" className="avatar-part arm right" onClick={() => onReact?.('happyJump')} aria-label="Tap paw for bounce">
        <span className="avatar-paw-pad" aria-hidden="true" />
      </button>
      <div className="avatar-part leg left" aria-hidden="true">
        <span className="avatar-paw-cap" />
      </div>
      <div className="avatar-part leg right" aria-hidden="true">
        <span className="avatar-paw-cap" />
      </div>
      <button
        type="button"
        className="avatar-part accessory"
        onClick={() => onReact?.('proudSparkle')}
        aria-label="Tap badge for sparkle"
      >
        <span className="avatar-accessory-star" aria-hidden="true" />
      </button>
    </div>
  );
};

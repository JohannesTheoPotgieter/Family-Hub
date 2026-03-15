import type { AvatarCompanion } from '../domain/avatarTypes';
import type { AvatarAnimation } from './AvatarAnimations';

type Props = { companion: AvatarCompanion; animation: AvatarAnimation; onReact?: (reaction: AvatarAnimation) => void };

export const AvatarModel = ({ companion, animation, onReact }: Props) => (
  <div className={`avatar-3d-figure is-${animation}`}>
    <button type="button" className="avatar-part head" onClick={() => onReact?.('wave')} aria-label="Tap head for wave" />
    <button type="button" className="avatar-part torso" onClick={() => onReact?.('happyJump')} aria-label="Tap belly for laugh" />
    <button type="button" className="avatar-part arm left" onClick={() => onReact?.('wave')} aria-label="Tap hand for high five" />
    <button type="button" className="avatar-part arm right" aria-label="Right hand" />
    <div className="avatar-part leg left" />
    <div className="avatar-part leg right" />
    <button
      type="button"
      className="avatar-part accessory"
      style={{ background: companion.appearance.auraColor ?? '#ffe39a' }}
      onClick={() => onReact?.('proudSparkle')}
      aria-label="Tap accessory for sparkle"
    />
  </div>
);

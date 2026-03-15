import { useMemo, useState } from 'react';
import type { AvatarCompanion } from '../domain/avatarTypes';
import { AvatarModel } from './AvatarModel';
import type { AvatarAnimation } from './AvatarAnimations';
import { moodAnimationMap } from './avatarPresets';
import { AvatarRoomScene } from './AvatarRoomScene';

type Props = { companion: AvatarCompanion; reducedMotion: boolean };

export const AvatarScene = ({ companion, reducedMotion }: Props) => {
  const [anim, setAnim] = useState<AvatarAnimation>(moodAnimationMap[companion.mood]);
  const [rotation, setRotation] = useState(0);
  const animation = useMemo(() => (reducedMotion ? 'idle' : anim), [anim, reducedMotion]);

  return (
    <div className="avatar-canvas-wrap" role="img" aria-label={`${companion.name} full body companion`}>
      <div
        className="avatar-stage"
        style={{ transform: `rotateY(${rotation}deg)` }}
        onMouseMove={(event) => {
          if (event.buttons === 1) setRotation((value) => Math.max(-30, Math.min(30, value + event.movementX * 0.6)));
        }}
      >
        <AvatarRoomScene />
        <AvatarModel companion={companion} animation={animation} onReact={setAnim} />
      </div>
      <div className="chip-list">
        {(['wave', 'happyJump', 'sleepyIdle', 'sadSlump', 'curiousLook', 'proudSparkle'] as AvatarAnimation[]).map((item) => (
          <button key={item} type="button" className="chip-action" onClick={() => setAnim(item)}>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
};

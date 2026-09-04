import { useEffect, useState } from 'react';
import brandIconUrl from '../../../brand/still-app-icon-1024.png';

const standardDurationMs = 1_180;
const reducedMotionDurationMs = 520;

export function BrandLaunchScreen() {
  const [visible, setVisible] = useState(true);
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const timer = window.setTimeout(
      () => setVisible(false),
      reduceMotion ? reducedMotionDurationMs : standardDurationMs,
    );
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  if (!visible) return null;

  return (
    <div
      className="brand-launch-screen"
      data-reduced-motion={reduceMotion ? 'true' : 'false'}
      role="status"
      aria-label="Still 正在启动"
    >
      <span className="brand-launch-screen__orange" aria-hidden="true" />
      <img className="brand-launch-screen__icon" src={brandIconUrl} alt="" draggable={false} />
    </div>
  );
}

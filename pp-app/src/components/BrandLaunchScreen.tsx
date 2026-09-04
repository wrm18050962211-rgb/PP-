import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'react';
import brandIconUrl from '../../../brand/still-app-icon-1024.png';

const isNativePlatform = Capacitor.isNativePlatform();
const expansionStartDelayMs = isNativePlatform ? 1_250 : 260;
const fallbackDismissDelayMs = isNativePlatform ? 3_500 : 2_000;

export function BrandLaunchScreen() {
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState<'waiting' | 'expanding'>('waiting');

  useEffect(() => {
    let secondFrame = 0;
    let startTimer = 0;

    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        startTimer = window.setTimeout(() => {
          setPhase('expanding');
        }, expansionStartDelayMs);
      });
    });
    const fallbackTimer = window.setTimeout(() => setVisible(false), fallbackDismissDelayMs);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(startTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="brand-launch-screen"
      data-phase={phase}
      role="status"
      aria-label="Still 正在启动"
    >
      <span
        className="brand-launch-screen__orange"
        aria-hidden="true"
        onAnimationEnd={() => setVisible(false)}
      />
      <img className="brand-launch-screen__icon" src={brandIconUrl} alt="" draggable={false} />
    </div>
  );
}

'use client';

import { memo, useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  delay?: number;
  duration?: number;
  prefix?: string;
  className?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function AnimatedNumber({
  value,
  delay = 0,
  duration = 1000,
  prefix = '',
  className,
}: AnimatedNumberProps) {
  // Start at the target value so first paint isn't a flash to 0.
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>(0);
  const fromRef = useRef(value);
  const isFirstRunRef = useRef(true);

  useEffect(() => {
    // Animate from the last shown value to the new value.
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    // First mount animates from 0 → value (the count-up effect).
    const startFrom = isFirstRunRef.current ? 0 : from;
    isFirstRunRef.current = false;
    setDisplay(startFrom);

    const startTime = performance.now() + delay;

    function tick(now: number) {
      const elapsed = now - startTime;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = Math.round(startFrom + (to - startFrom) * eased);
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, delay, duration]);

  return <span className={className}>{prefix}{display}</span>;
}

export default memo(AnimatedNumber);

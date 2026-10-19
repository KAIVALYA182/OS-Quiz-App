// frontend/src/hooks/useStopwatch.js
// Counts seconds since `running` first became true. If `limitSeconds` is given,
// also reports the time remaining and calls `onExpire` once when it reaches zero.
//
// It measures with Date.now() rather than counting ticks, so a throttled
// background tab can't make the clock drift.

import { useCallback, useEffect, useRef, useState } from "react";

export function useStopwatch({ running, limitSeconds = null, onExpire }) {
  const startRef = useRef(null);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return undefined;
    if (startRef.current === null) startRef.current = Date.now();

    const tick = () => {
      const seconds = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(seconds);
      if (limitSeconds && seconds >= limitSeconds && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [running, limitSeconds]);

  const getElapsedSeconds = useCallback(
    () => (startRef.current === null ? 0 : Math.floor((Date.now() - startRef.current) / 1000)),
    []
  );

  return {
    elapsed,
    remaining: limitSeconds ? Math.max(0, limitSeconds - elapsed) : null,
    getElapsedSeconds,
  };
}

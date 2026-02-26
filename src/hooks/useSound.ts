'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SoundManager } from '@/lib/sounds';

const MUTE_KEY = 'zero-game-muted';

let sharedManager: SoundManager | null = null;

function getManager(): SoundManager {
  if (!sharedManager) {
    sharedManager = new SoundManager();
    if (typeof window !== 'undefined') {
      sharedManager.muted = localStorage.getItem(MUTE_KEY) === 'true';
    }
  }
  return sharedManager;
}

export function useSound() {
  const manager = useRef(getManager());
  const [muted, setMuted] = useState(manager.current.muted);

  const toggleMute = useCallback(() => {
    const next = !manager.current.muted;
    manager.current.muted = next;
    setMuted(next);
    localStorage.setItem(MUTE_KEY, String(next));
  }, []);

  return {
    sound: manager.current,
    muted,
    toggleMute,
  };
}

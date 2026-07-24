'use client';

import { useEffect, useState } from 'react';

/**
 * Tiny component that confirms React hydration succeeded.
 * Renders nothing initially (SSR), then shows a green dot after mount.
 * If React never hydrates, this remains invisible.
 */
export function HydrationIndicator() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 4,
        left: 4,
        zIndex: 99999,
        background: '#22c55e',
        color: 'white',
        padding: '1px 5px',
        fontSize: '9px',
        fontFamily: 'monospace',
        borderRadius: 3,
      }}
    >
      OK
    </div>
  );
}

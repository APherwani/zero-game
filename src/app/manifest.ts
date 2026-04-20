import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zero Game',
    short_name: 'Zero Game',
    description: 'Call your tricks. Hit them exact, or get zero.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#052e16',
    theme_color: '#052e16',
    icons: [
      {
        src: '/zero-game-icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/zero-game-icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface RoomQRCodeProps {
  roomCode: string;
}

export default function RoomQRCode({ roomCode }: RoomQRCodeProps) {
  const [joinUrl, setJoinUrl] = useState('');

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/?join=${roomCode}`);
  }, [roomCode]);

  if (!joinUrl) return null;

  return (
    <div className="flex flex-col items-center gap-2 my-4">
      <p className="text-white/50 text-sm">Scan to join</p>
      <div className="bg-white p-3 rounded-xl">
        <QRCodeSVG value={joinUrl} size={160} />
      </div>
    </div>
  );
}

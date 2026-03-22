"use client";

import { useState } from "react";

interface PlayerImageProps {
  player: { name: string; espnId?: string };
  size?: number;
  className?: string;
}

export function PlayerImage({
  player,
  size = 80,
  className = "",
}: PlayerImageProps) {
  const [src, setSrc] = useState(
    player.espnId
      ? `https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${player.espnId}.png`
      : getFallback(player.name),
  );

  return (
    <img
      src={src}
      alt={player.name}
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
      onError={() => setSrc(getFallback(player.name))}
    />
  );
}

function getFallback(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a3a5c&color=D4AF37&size=160&bold=true&font-size=0.4`;
}

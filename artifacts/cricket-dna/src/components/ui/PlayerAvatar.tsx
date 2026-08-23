import { useState } from "react";
import { motion } from "framer-motion";
import { getPlayerImageUrl, getInitials, ARCHETYPE_AVATAR_COLORS, type ImageSize } from "@/lib/playerImage";
import type { Player } from "@/data/mockData";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlayerAvatarProps {
  player: Player;
  size?: number;           // px — diameter of the circle
  imageSize?: ImageSize;   // Cricinfo image resolution: '100' | '200' | '340'
  showFlag?: boolean;      // show country flag badge below avatar
  showRing?: boolean;      // coloured archetype ring around avatar
  animate?: boolean;       // slide-in entrance animation
  className?: string;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PlayerAvatar({
  player,
  size = 96,
  imageSize = '200',
  showFlag = true,
  showRing = true,
  animate = true,
  className = '',
}: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const src = getPlayerImageUrl(player.cricInfoId, imageSize);
  const showInitials = !src || imgError;
  const colors = ARCHETYPE_AVATAR_COLORS[player.archetypeId] ?? ARCHETYPE_AVATAR_COLORS['H'];

  const ringStyle = showRing
    ? { boxShadow: `0 0 0 2px #0a0a0a, 0 0 0 4px ${colors.text}40` }
    : {};

  const avatar = (
    <div
      className={`relative inline-flex flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* ── Image or Initials ── */}
      {showInitials ? (
        <InitialsAvatar
          name={player.name}
          archetypeId={player.archetypeId}
          size={size}
          style={ringStyle}
        />
      ) : (
        <img
          src={src!}
          alt={player.name}
          width={size}
          height={size}
          onError={() => setImgError(true)}
          className="rounded-full object-cover object-top w-full h-full"
          style={{
            background: colors.bg,
            ...ringStyle,
          }}
        />
      )}

      {/* ── Flag badge ── */}
      {showFlag && (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 leading-none select-none"
          style={{ fontSize: Math.max(12, size * 0.18) }}
          aria-label={player.country}
        >
          {player.flag}
        </span>
      )}
    </div>
  );

  if (!animate) return avatar;

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      {avatar}
    </motion.div>
  );
}

// ─── Initials fallback ───────────────────────────────────────────────────────

interface InitialsAvatarProps {
  name: string;
  archetypeId: string;
  size: number;
  style?: React.CSSProperties;
}

function InitialsAvatar({ name, archetypeId, size, style }: InitialsAvatarProps) {
  const colors = ARCHETYPE_AVATAR_COLORS[archetypeId] ?? ARCHETYPE_AVATAR_COLORS['H'];
  const initials = getInitials(name);
  const fontSize = Math.round(size * 0.32);

  return (
    <div
      className="rounded-full flex items-center justify-center select-none font-medium tracking-wider w-full h-full"
      style={{
        background: colors.bg,
        color: colors.text,
        fontSize,
        border: `1px solid ${colors.text}30`,
        ...style,
      }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}

// ─── VS Hero layout — use in BattleArena ────────────────────────────────────

interface PlayerHeroProps {
  player: Player;
  side: 'left' | 'right';
  size?: number;
}

export function PlayerHero({ player, side, size = 120 }: PlayerHeroProps) {
  const colors = ARCHETYPE_AVATAR_COLORS[player.archetypeId] ?? ARCHETYPE_AVATAR_COLORS['H'];

  return (
    <motion.div
      className={`flex flex-col items-center gap-3 ${side === 'right' ? 'items-end text-right' : 'items-start text-left'}`}
      initial={{ x: side === 'left' ? -80 : 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 22, delay: 0.1 }}
    >
      <PlayerAvatar
        player={player}
        size={size}
        imageSize="340"
        showFlag={true}
        showRing={true}
        animate={false}
      />

      {/* Name */}
      <div
        className="font-serif leading-tight"
        style={{ fontSize: 'clamp(18px, 3vw, 26px)' }}
      >
        {player.name}
      </div>

      {/* Archetype badge */}
      <div
        className="text-xs tracking-widest uppercase font-medium px-3 py-1 rounded-full"
        style={{
          color: colors.text,
          background: colors.bg,
          border: `1px solid ${colors.text}40`,
        }}
      >
        {player.archetype}
      </div>
    </motion.div>
  );
}

// ─── Mini avatar — for lists, search results, DNA twins ─────────────────────

interface MiniAvatarProps {
  player: Player;
  size?: number;
  showName?: boolean;
}

export function MiniAvatar({ player, size = 40, showName = false }: MiniAvatarProps) {
  return (
    <div className="flex items-center gap-2">
      <PlayerAvatar
        player={player}
        size={size}
        imageSize="100"
        showFlag={false}
        showRing={false}
        animate={false}
      />
      {showName && (
        <span className="text-sm font-medium text-white/90 leading-tight">{player.name}</span>
      )}
    </div>
  );
}

// ─── Picker card — used in BattleArena player selection grid ────────────────

interface PlayerPickerCardProps {
  player: Player;
  onSelect: (player: Player) => void;
  isSelected?: boolean;
}

export function PlayerPickerCard({ player, onSelect, isSelected = false }: PlayerPickerCardProps) {
  const colors = ARCHETYPE_AVATAR_COLORS[player.archetypeId] ?? ARCHETYPE_AVATAR_COLORS['H'];

  return (
    <motion.button
      onClick={() => onSelect(player)}
      className="w-full flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors text-center"
      style={{
        background: isSelected ? colors.bg : 'transparent',
        borderColor: isSelected ? colors.text : 'rgba(255,255,255,0.08)',
        cursor: 'pointer',
      }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <PlayerAvatar
        player={player}
        size={72}
        imageSize="100"
        showFlag={true}
        showRing={isSelected}
        animate={false}
      />
      <div className="text-sm font-medium text-white/90 leading-tight">{player.name}</div>
      <div
        className="text-xs px-2 py-0.5 rounded-full"
        style={{ color: colors.text, background: `${colors.text}20` }}
      >
        {player.archetypeId}
      </div>

      {/* Selected checkmark */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: colors.text }}
        >
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      )}
    </motion.button>
  );
}

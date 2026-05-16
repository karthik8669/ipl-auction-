'use client'

import { useEffect, useState } from 'react'

export function MadeByBadge() {
  const [hovered, setHovered] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const updateSize = () => setIsMobile(window.innerWidth < 768)
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const compact = isMobile

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        bottom: compact ? 'calc(88px + env(safe-area-inset-bottom))' : 16,
        left: compact ? 12 : 16,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 8,
        padding: compact ? '6px 10px' : '8px 16px',
        borderRadius: 50,
        background: 'rgba(3,12,24,0.92)',
        border: `1px solid ${hovered
          ? 'rgba(212,175,55,0.6)'
          : 'rgba(212,175,55,0.3)'}`,
        backdropFilter: 'blur(12px)',
        boxShadow: hovered
          ? '0 8px 28px rgba(212,175,55,0.2)'
          : '0 4px 24px rgba(0,0,0,0.4)',
        userSelect: 'none',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'all 0.2s',
        cursor: 'default',
        maxWidth: compact ? 'calc(100vw - 24px)' : 'none',
      }}
    >
      <div style={{
        width: compact ? 24 : 30, height: compact ? 24 : 30,
        borderRadius: '50%',
        backgroundImage: 'linear-gradient(135deg, #D4AF37, #f5d76e)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontFamily: 'Teko, sans-serif',
        fontSize: compact ? 13 : 16,
        fontWeight: 700,
        color: '#111',
        boxShadow: '0 0 10px rgba(212,175,55,0.4)',
      }}>
        K
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontWeight: 600,
          fontSize: compact ? 8 : 9,
          color: '#5a8ab0',
          letterSpacing: compact ? 2 : 2.5,
          textTransform: 'uppercase',
          lineHeight: 1,
          marginBottom: 1,
        }}>
          {compact ? 'Made by' : 'Made by'}
        </div>
        <div style={{
          fontFamily: 'Teko, sans-serif',
          fontSize: compact ? 14 : 17,
          fontWeight: 700,
          color: '#D4AF37',
          lineHeight: 1,
          letterSpacing: 0.5,
          whiteSpace: 'nowrap',
        }}>
          Kartik Jain
        </div>
      </div>

      {!compact && (
        <div style={{
          width: 1, height: 26,
          background: 'rgba(212,175,55,0.2)',
          margin: '0 2px',
        }}/>
      )}

      <span style={{ fontSize: compact ? 13 : 16 }}>🏏</span>
    </div>
  )
}

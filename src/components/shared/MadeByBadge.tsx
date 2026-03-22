'use client'

import { useState } from 'react'

export function MadeByBadge() {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
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
      }}
    >
      <div style={{
        width: 30, height: 30,
        borderRadius: '50%',
        backgroundImage: 'linear-gradient(135deg, #D4AF37, #f5d76e)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontFamily: 'Teko, sans-serif',
        fontSize: 16,
        fontWeight: 700,
        color: '#111',
        boxShadow: '0 0 10px rgba(212,175,55,0.4)',
      }}>
        K
      </div>

      <div>
        <div style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontWeight: 600,
          fontSize: 9,
          color: '#5a8ab0',
          letterSpacing: 2.5,
          textTransform: 'uppercase',
          lineHeight: 1,
          marginBottom: 1,
        }}>
          Made by
        </div>
        <div style={{
          fontFamily: 'Teko, sans-serif',
          fontSize: 17,
          fontWeight: 700,
          color: '#D4AF37',
          lineHeight: 1,
          letterSpacing: 0.5,
        }}>
          Kartik Jain
        </div>
      </div>

      <div style={{
        width: 1, height: 26,
        background: 'rgba(212,175,55,0.2)',
        margin: '0 2px',
      }}/>

      <span style={{ fontSize: 16 }}>🏏</span>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { ref, set } from 'firebase/database'
import { realtimeDb as db } from '@/lib/firebase'

const PRESET_COLORS = [
  '#D4AF37', '#ff4060', '#00c896', '#4da6ff',
  '#b57bee', '#ff8c00', '#00d4ff', '#ff6b6b',
  '#a8ff78', '#f093fb',
]

const PRESET_LOGOS = [
  '🦁','🐯','🦅','🐉','⚡','🔥','🌊','💎','🏆','⚔️',
  '🦊','🐺','🦋','🌟','💫','🚀','👑','🎯','💥','🌈',
]

export function FranchiseSetup({
  userId, code, existing
}: {
  userId: string
  code: string
  existing?: { name: string; color: string; logo: string }
}) {
  const [name, setName] = useState(existing?.name || '')
  const [color, setColor] = useState(existing?.color || '#D4AF37')
  const [logo, setLogo] = useState(existing?.logo || '🦁')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await set(ref(db, `rooms/${code}/franchises/${userId}`), {
        name: name.trim(),
        color,
        logo,
        createdAt: Date.now(),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch(e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: 'rgba(7,24,44,0.9)',
      border: '1px solid #1a3a5c',
      borderRadius: 16,
      padding: '20px',
      marginBottom: 16,
    }}>
      <div style={{
        fontFamily: 'Teko', fontSize: 28,
        color: '#D4AF37', marginBottom: 4,
        letterSpacing: 1,
      }}>
        🏟️ Name Your Franchise
      </div>
      <div style={{
        color: '#5a8ab0', fontSize: 13,
        marginBottom: 16,
      }}>
        Set your franchise name before the auction starts
      </div>

      {/* Preview */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: 12, padding: '14px 16px',
        background: `${color}12`,
        border: `1px solid ${color}40`,
        borderRadius: 12, marginBottom: 16,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: `${color}25`,
          border: `2px solid ${color}`,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 22,
        }}>
          {logo}
        </div>
        <div>
          <div style={{
            fontFamily: 'Teko', fontSize: 24,
            color: color, lineHeight: 1,
            letterSpacing: 1,
          }}>
            {name || 'Your Franchise'}
          </div>
          <div style={{ color: '#5a8ab0', fontSize: 11 }}>
            Preview
          </div>
        </div>
      </div>

      {/* Name input */}
      <input
        value={name}
        onChange={e => setName(e.target.value.slice(0, 24))}
        placeholder="e.g. Mumbai Mavericks"
        maxLength={24}
        style={{
          width: '100%',
          background: 'rgba(3,49,94,0.4)',
          border: '1px solid #1a3a5c',
          borderRadius: 8, padding: '10px 14px',
          color: '#fff',
          fontFamily: 'Rajdhani', fontWeight: 700,
          fontSize: 16, outline: 'none',
          marginBottom: 14,
        }}
        onFocus={e => e.target.style.borderColor = '#D4AF37'}
        onBlur={e => e.target.style.borderColor = '#1a3a5c'}
      />

      {/* Logo picker */}
      <div style={{
        color: '#5a8ab0', fontSize: 10,
        letterSpacing: 2, textTransform: 'uppercase',
        marginBottom: 8, fontFamily: 'Rajdhani', fontWeight: 600,
      }}>
        Choose Logo
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap',
        gap: 6, marginBottom: 14,
      }}>
        {PRESET_LOGOS.map(l => (
          <button
            key={l}
            onClick={() => setLogo(l)}
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: `1px solid ${logo === l ? color : '#1a3a5c'}`,
              background: logo === l ? `${color}20` : 'rgba(13,34,64,0.5)',
              fontSize: 18, cursor: 'pointer',
              transition: 'all 0.1s',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Color picker */}
      <div style={{
        color: '#5a8ab0', fontSize: 10,
        letterSpacing: 2, textTransform: 'uppercase',
        marginBottom: 8, fontFamily: 'Rajdhani', fontWeight: 600,
      }}>
        Team Color
      </div>
      <div style={{
        display: 'flex', gap: 6,
        flexWrap: 'wrap', marginBottom: 16,
      }}>
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{
              width: 28, height: 28,
              borderRadius: '50%',
              background: c,
              border: color === c
                ? '3px solid #fff'
                : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.1s',
              boxShadow: color === c
                ? `0 0 10px ${c}80` : 'none',
            }}
          />
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={!name.trim() || saving}
        style={{
          width: '100%', padding: '12px',
          borderRadius: 10, border: 'none',
          background: name.trim()
            ? `linear-gradient(135deg, ${color}, ${color}cc)`
            : '#1a3a5c',
          color: name.trim() ? '#111' : '#5a8ab0',
          fontFamily: 'Teko', fontWeight: 700,
          fontSize: 22, letterSpacing: 2,
          cursor: name.trim() ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s',
          boxShadow: name.trim()
            ? `0 4px 16px ${color}40` : 'none',
        }}
      >
        {saving ? '⏳ SAVING...' :
         saved  ? '✅ SAVED!'   : '💾 SAVE FRANCHISE'}
      </button>
    </div>
  )
}

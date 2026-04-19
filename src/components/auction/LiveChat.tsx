'use client'
import { useState, useEffect, useRef } from 'react'
import { ref, push, onValue, off } from 'firebase/database'
import { realtimeDb as db } from '@/lib/firebase'
import { ChatMessage, RoomState } from '@/types/room'

const QUICK_REACTIONS = ['🔥','😂','😤','💰','🏆','😮','👏','💸','🎯','⚡']

const QUICK_TAUNTS = [
  'Too easy 😎',
  'Your wallet crying 💸',
  'That player is MINE 🏆',
  'Good luck with that 😂',
  'Outbid again! 😤',
  'Watch and learn 👀',
  'Big mistake 🤣',
  'GG already 🏆',
]

export function LiveChat({
  code, user, roomState, isOpen, onToggle
}: {
  code: string
  user: any
  roomState: RoomState
  isOpen: boolean
  onToggle: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [showTaunts, setShowTaunts] = useState(false)
  const [unread, setUnread] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastReadRef = useRef(0)

  const franchise = roomState?.franchises?.[user?.uid]

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!code) return
    const chatRef = ref(db, `rooms/${code}/chat`)
    const unsub = onValue(chatRef, snap => {
      if (!snap.exists()) { setMessages([]); return }
      const msgs = Object.entries(snap.val())
        .map(([id, m]: any) => ({ id, ...m }))
        .sort((a: any, b: any) => a.createdAt - b.createdAt)
        .slice(-100)
      setMessages(msgs as ChatMessage[])

      // Count unread if chat is closed
      if (!isOpen) {
        const newMsgs = msgs.filter(
          (m: any) => m.createdAt > lastReadRef.current
            && m.userId !== user?.uid
        )
        setUnread(prev => prev + newMsgs.length)
      }
    })
    return () => off(chatRef)
  }, [code, isOpen, user?.uid])

  useEffect(() => {
    if (isOpen) {
      setUnread(0)
      lastReadRef.current = Date.now()
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [isOpen, messages])

  async function sendMessage(text: string, isReaction = false) {
    if (!text.trim() || !user) return
    const f = roomState?.franchises?.[user.uid]
    await push(ref(db, `rooms/${code}/chat`), {
      userId: user.uid,
      name: user.displayName || 'Player',
      photoURL: user.photoURL || '',
      text: text.trim(),
      emoji: null,
      type: isReaction ? 'reaction' : 'message',
      franchiseName:  f?.name  || user.displayName,
      franchiseColor: f?.color || '#D4AF37',
      franchiseLogo:  f?.logo  || '🏏',
      createdAt: Date.now(),
    })
    setInput('')
  }

  async function sendEmoji(emoji: string) {
    if (!user) return
    await push(ref(db, `rooms/${code}/chat`), {
      userId: user.uid,
      name: user.displayName || 'Player',
      photoURL: user.photoURL || '',
      text: emoji,
      emoji: emoji,
      type: 'reaction',
      franchiseName:  franchise?.name  || user.displayName,
      franchiseColor: franchise?.color || '#D4AF37',
      createdAt: Date.now(),
    })
  }

  return (
    <>
      {/* Chat toggle button */}
      <button
        onClick={onToggle}
        style={{
          position: 'fixed',
          bottom: isMobile ? 70 : 80,
          right: isMobile ? 12 : 20,
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: isMobile ? '10px 14px' : '12px 20px',
          borderRadius: isMobile ? 40 : 50,
          border: '1px solid rgba(0,200,150,0.4)',
          background: isOpen
            ? 'rgba(0,200,150,0.15)'
            : 'rgba(7,24,44,0.95)',
          color: '#00c896',
          fontFamily: 'Rajdhani',
          fontWeight: 700, fontSize: isMobile ? 13 : 15,
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 20px rgba(0,200,150,0.2)',
          letterSpacing: 1,
          transition: 'all 0.2s',
        }}
      >
        💬 Chat
        {unread > 0 && (
          <div style={{
            position: 'absolute', top: -6, right: -6,
            width: 20, height: 20, borderRadius: '50%',
            background: '#ff4060', color: '#fff',
            fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #030c18',
            animation: 'pulse 1s ease-in-out infinite',
          }}>
            {unread > 9 ? '9+' : unread}
          </div>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <>
          <div
            onClick={onToggle}
            style={{
              position: 'fixed', inset: 0,
              zIndex: 298, background: 'transparent',
            }}
          />
          <div style={{
            position: 'fixed',
            bottom: isMobile ? 120 : 190,
            right: isMobile ? 12 : 20,
            width: isMobile ? 'calc(100vw - 24px)' : 'min(360px, calc(100vw - 40px))',
            height: 420,
            background: 'rgba(7,24,44,0.98)',
            border: '1px solid rgba(0,200,150,0.3)',
            borderRadius: 16,
            zIndex: 299,
            display: 'flex',
            flexDirection: 'column',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            animation: 'fadeInUp 0.2s ease-out',
          }}>

            {/* Chat header */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #1a3a5c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{
                fontFamily: 'Teko', fontSize: 20,
                color: '#00c896', letterSpacing: 1,
              }}>
                💬 LIVE CHAT
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center', gap: 6,
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#00c896',
                  animation: 'pulse 1s ease-in-out infinite',
                }}/>
                <span style={{
                  color: '#00c896', fontSize: 10,
                  letterSpacing: 2, fontWeight: 700,
                }}>
                  LIVE
                </span>
              </div>
            </div>

            {/* Quick reactions */}
            <div style={{
              display: 'flex', gap: 4,
              padding: '8px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              overflowX: 'auto', flexShrink: 0,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}>
              {QUICK_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => sendEmoji(emoji)}
                  style={{
                    fontSize: 18, background: 'none',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '4px 8px',
                    cursor: 'pointer', flexShrink: 0,
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.transform = 'scale(1.2)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: 'auto',
              padding: '10px 12px',
              display: 'flex', flexDirection: 'column',
              gap: 6,
            }}>
              {messages.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  color: '#5a8ab0', fontSize: 12,
                  marginTop: 40, fontStyle: 'italic',
                }}>
                  No messages yet. Say something! 👋
                </div>
              )}

              {messages.map(msg => {
                const isMe = msg.userId === user?.uid
                const isEmoji = msg.type === 'reaction' && msg.text.length <= 4
                const isSystem = msg.type === 'system'

                if (isSystem) return (
                  <div key={msg.id} style={{
                    textAlign: 'center',
                    color: '#5a8ab0', fontSize: 11,
                    fontStyle: 'italic', padding: '4px 0',
                    margin: '4px 0',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    {msg.text}
                  </div>
                )

                if (isEmoji) return (
                  <div key={msg.id} style={{
                    display: 'flex',
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    alignItems: 'center', gap: 6,
                  }}>
                    {!isMe && (
                      <span style={{
                        fontSize: 10,
                        color: msg.franchiseColor || '#5a8ab0',
                        fontFamily: 'Rajdhani', fontWeight: 600,
                      }}>
                        {msg.franchiseName || msg.name}
                      </span>
                    )}
                    <span style={{
                      fontSize: 28,
                      animation: 'bounceIn 0.3s ease-out',
                    }}>
                      {msg.text}
                    </span>
                    {isMe && (
                      <span style={{
                        fontSize: 10, color: '#D4AF37',
                        fontFamily: 'Rajdhani', fontWeight: 600,
                      }}>
                        You
                      </span>
                    )}
                  </div>
                )

                return (
                  <div key={msg.id} style={{
                    display: 'flex',
                    flexDirection: isMe ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    gap: 6,
                  }}>
                    {/* Avatar */}
                    {!isMe && (
                      <img
                        src={msg.photoURL || ''}
                        style={{
                          width: 24, height: 24,
                          borderRadius: '50%',
                          objectFit: 'cover', flexShrink: 0,
                          border: `1px solid ${msg.franchiseColor || '#1a3a5c'}`,
                        }}
                        onError={e => {
                          (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.name)}&background=1a3a5c&color=D4AF37&bold=true&size=24`
                        }}
                      />
                    )}

                    <div style={{
                      maxWidth: '75%',
                    }}>
                      {/* Name */}
                      {!isMe && (
                        <div style={{
                          fontSize: 10,
                          color: msg.franchiseColor || '#5a8ab0',
                          fontFamily: 'Rajdhani', fontWeight: 700,
                          marginBottom: 2, letterSpacing: 0.5,
                        }}>
                          {msg.franchiseName || msg.name}
                        </div>
                      )}

                      {/* Bubble */}
                      <div style={{
                        padding: '7px 12px',
                        borderRadius: isMe
                          ? '14px 14px 4px 14px'
                          : '14px 14px 14px 4px',
                        background: isMe
                          ? `${msg.franchiseColor || '#D4AF37'}20`
                          : 'rgba(13,34,64,0.8)',
                        border: `1px solid ${isMe
                          ? `${msg.franchiseColor || '#D4AF37'}30`
                          : 'rgba(255,255,255,0.06)'}`,
                        color: '#ddeeff',
                        fontSize: 13,
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef}/>
            </div>

            {/* Taunts dropdown */}
            {showTaunts && (
              <div style={{
                position: 'absolute',
                bottom: 56, left: 12, right: 12,
                background: '#07182c',
                border: '1px solid #1a3a5c',
                borderRadius: 10,
                padding: 8,
                display: 'flex', flexDirection: 'column', gap: 4,
                zIndex: 10,
                boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
              }}>
                <div style={{
                  color: '#5a8ab0', fontSize: 10,
                  letterSpacing: 2, padding: '2px 6px',
                  fontFamily: 'Rajdhani', fontWeight: 600,
                  textTransform: 'uppercase',
                }}>
                  Quick Taunts
                </div>
                {QUICK_TAUNTS.map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      sendMessage(t)
                      setShowTaunts(false)
                    }}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 7,
                      border: 'none',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#ddeeff',
                      textAlign: 'left',
                      fontSize: 13, cursor: 'pointer',
                      transition: 'background 0.1s',
                      fontFamily: 'Rajdhani', fontWeight: 500,
                    }}
                    onMouseEnter={e =>
                      e.currentTarget.style.background = 'rgba(212,175,55,0.1)'}
                    onMouseLeave={e =>
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{
              padding: '8px 10px',
              borderTop: '1px solid #1a3a5c',
              display: 'flex', gap: 6,
              flexShrink: 0,
            }}>
              <button
                onClick={() => setShowTaunts(s => !s)}
                style={{
                  width: 34, height: 34,
                  borderRadius: 8, border: '1px solid #1a3a5c',
                  background: showTaunts
                    ? 'rgba(212,175,55,0.15)' : 'transparent',
                  fontSize: 16, cursor: 'pointer',
                  color: showTaunts ? '#D4AF37' : '#5a8ab0',
                  flexShrink: 0, transition: 'all 0.1s',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Quick taunts"
              >
                😤
              </button>

              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(input)
                  }
                  if (e.key === 'Escape') setShowTaunts(false)
                }}
                placeholder="Say something..."
                maxLength={200}
                style={{
                  flex: 1,
                  background: 'rgba(3,49,94,0.4)',
                  border: '1px solid #1a3a5c',
                  borderRadius: 8, padding: '7px 12px',
                  color: '#ddeeff', fontSize: 13,
                  outline: 'none',
                  fontFamily: 'Inter',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#00c896'
                  setShowTaunts(false)
                }}
                onBlur={e => e.target.style.borderColor = '#1a3a5c'}
              />

              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                style={{
                  width: 34, height: 34,
                  borderRadius: 8, border: 'none',
                  background: input.trim()
                    ? 'rgba(0,200,150,0.2)' : '#1a3a5c',
                  color: input.trim() ? '#00c896' : '#5a8ab0',
                  fontSize: 16, cursor: input.trim()
                    ? 'pointer' : 'not-allowed',
                  flexShrink: 0, transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ➤
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

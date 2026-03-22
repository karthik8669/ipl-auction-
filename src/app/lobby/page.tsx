'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { ref, set, get, onValue, off } from 'firebase/database'
import { auth, db } from '@/lib/firebase'

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

interface PublicRoom {
  code: string
  hostName: string
  hostPhoto: string
  playerCount: number
  status: string
  createdAt: number
}

export default function LobbyPage() {
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [windowWidth, setWindowWidth] = useState(1200)

  // Tab state
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create')

  // Create room
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [roomName, setRoomName] = useState('')

  // Join room
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  // Public rooms
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([])


  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth)
      const handleResize = () => setWindowWidth(window.innerWidth)
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  const isMobile = windowWidth < 768

  useEffect(() => {
    // Fast path — already logged in
    if (auth.currentUser) {
      setUser(auth.currentUser)
      setAuthLoading(false)
      return
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u)
        setAuthLoading(false)
      } else {
        window.location.href = '/'
      }
    })

    return () => unsub()
  }, [])

  // Listen to public rooms
  useEffect(() => {
    if (!user) return
    const roomsRef = ref(db, 'rooms')
    const unsub = onValue(roomsRef, (snap) => {
      if (!snap.exists()) { setPublicRooms([]); return }
      const rooms: PublicRoom[] = []
      snap.forEach((child) => {
        const data = child.val()
        if (
          data?.meta?.isPublic === true &&
          data?.meta?.status === 'waiting'
        ) {
          const participants = data?.participants || {}
          rooms.push({
            code: child.key!,
            hostName: data.meta.hostName || 'Host',
            hostPhoto: data.meta.hostPhoto || '',
            playerCount: Object.keys(participants).length,
            status: data.meta.status,
            createdAt: data.meta.createdAt || 0,
          })
        }
      })
      // Sort by most recent first
      rooms.sort((a, b) => b.createdAt - a.createdAt)
      setPublicRooms(rooms.slice(0, 6))
    })
    return () => off(roomsRef)
  }, [user])

  async function handleCreateRoom() {
    if (!user || creating) {
      console.log('Guard blocked:', { user: !!user, creating })
      return
    }
    setCreating(true)
    setCreateError('')

    console.log('Creating room for user:', user.uid)

    try {
      const code = generateRoomCode()
      console.log('Generated code:', code)
      
      // Use update instead of set — more reliable
      const updates: Record<string, any> = {}
      
      updates[`rooms/${code}/meta`] = {
        hostId: user.uid,
        hostName: user.displayName || 'Host',
        hostPhoto: user.photoURL || '',
        roomName: roomName.trim() || `${(user.displayName || 'Host').split(' ')[0]}'s Room`,
        status: 'waiting',
        isPublic: isPublic,
        createdAt: Date.now(),
      }
      
      updates[`rooms/${code}/participants/${user.uid}`] = {
        name: user.displayName || 'Host',
        email: user.email || '',
        photoURL: user.photoURL || '',
        budget: 100,
        overseas: 0,
        squadSize: 0,
        isReady: false,
        joinedAt: Date.now(),
      }
      
      updates[`rooms/${code}/auction/pool`] = []
      updates[`rooms/${code}/auction/currentIndex`] = 0
      updates[`rooms/${code}/auction/phase`] = 'waiting'
      updates[`rooms/${code}/auction/currentBid`] = 0
      updates[`rooms/${code}/auction/leaderId`] = ''
      updates[`rooms/${code}/auction/leaderName`] = ''
      updates[`rooms/${code}/auction/timerEnd`] = 0
      
      // Use update (not set) for atomic write
      const { update: fbUpdate } = await import('firebase/database')
      console.log('Writing to Firebase path:', `rooms/${code}`)
      await fbUpdate(ref(db), updates)
      console.log('Firebase write SUCCESS')
      
      console.log('Room created successfully:', code)
      window.location.href = `/room/${code}`
      
    } catch (e: any) {
      console.error('CREATE ROOM ERROR:', e.code, e.message)
      
      // Show specific error message
      if (e.code === 'PERMISSION_DENIED') {
        setCreateError('Firebase permission denied. Check database rules in Firebase Console.')
      } else if (e.code === 'NETWORK_ERROR') {
        setCreateError('Network error. Check your internet connection.')
      } else {
        setCreateError(e?.message || 'Failed to create room. Try again.')
      }
      setCreating(false)
    }
  }

  async function handleJoinRoom(codeToJoin?: string) {
    if (!user || joining) return
    const code = (codeToJoin || joinCode).trim().toUpperCase()
    if (code.length !== 6) { setJoinError('Enter a valid 6-letter code'); return }
    setJoining(true)
    setJoinError('')
    try {
      const snap = await get(ref(db, `rooms/${code}`))
      if (!snap.exists()) {
        setJoinError('Room not found. Check the code.')
        setJoining(false)
        return
      }
      const data = snap.val()
      if (data?.meta?.status === 'finished') {
        setJoinError('This auction has already ended.')
        setJoining(false)
        return
      }
      await set(ref(db, `rooms/${code}/participants/${user.uid}`), {
        name: user.displayName || 'Player',
        email: user.email || '',
        photoURL: user.photoURL || '',
        budget: 100,
        overseas: 0,
        squadSize: 0,
        isReady: false,
        joinedAt: Date.now(),
      })
      if (data?.meta?.status === 'auction') {
        window.location.href = `/room/${code}/auction`
      } else {
        window.location.href = `/room/${code}`
      }
    } catch (e: any) {
      setJoinError(e?.message || 'Failed to join room.')
      setJoining(false)
    }
  }

  async function handleSignOut() {
    await signOut(auth)
    window.location.href = '/'
  }

  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#030c18',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '3px solid rgba(212,175,55,0.15)',
          borderTopColor: '#D4AF37',
          animation: 'spin 0.8s linear infinite',
        }} />
        <div style={{
          fontFamily: 'Teko, sans-serif',
          fontSize: 18, color: '#D4AF37', letterSpacing: 4,
        }}>
          LOADING...
        </div>
        <div style={{ color: '#5a8ab0', fontSize: 12, marginTop: 8 }}>
          Taking too long?{' '}
          <span
            onClick={() => window.location.href = '/'}
            style={{ color: '#D4AF37', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Go back to login
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: '#030c18',
      backgroundImage: `
        radial-gradient(ellipse at 20% 20%, rgba(0,65,120,0.2) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(212,175,55,0.06) 0%, transparent 50%)
      `,
      fontFamily: 'Inter, sans-serif',
      color: '#ddeeff',
    }}>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(3,12,24,0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: isMobile ? '10px 16px' : '12px 28px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏏</span>
          <span style={{
            fontFamily: 'Teko, sans-serif', fontSize: 26,
            color: '#D4AF37', letterSpacing: 4,
          }}>IPL</span>
          {!isMobile && (
            <span style={{
              fontFamily: 'Teko, sans-serif', fontSize: 14,
              color: '#5a8ab0', letterSpacing: 3,
            }}>AUCTION 2026</span>
          )}
        </div>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src={user.photoURL || ''}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                border: '2px solid rgba(212,175,55,0.4)',
                objectFit: 'cover',
              }}
              onError={e => {
                (e.target as HTMLImageElement).src =
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=1a3a5c&color=D4AF37&bold=true`
              }}
            />
            {!isMobile && (
              <span style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontWeight: 600, fontSize: 14, color: '#ddeeff',
              }}>
                {user.displayName?.split(' ')[0]}
              </span>
            )}
            <button
              onClick={handleSignOut}
              style={{
                padding: '6px 14px', borderRadius: 8,
                border: '1px solid rgba(255,64,96,0.25)',
                background: 'rgba(255,64,96,0.06)',
                color: '#ff4060',
                fontFamily: 'Rajdhani, sans-serif',
                fontWeight: 600, fontSize: 12,
                cursor: 'pointer', letterSpacing: 1,
              }}
            >
              {isMobile ? '↩' : 'Sign Out'}
            </button>
          </div>
        )}
      </nav>

      {/* ── MAIN ── */}
      <main style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: isMobile ? '28px 16px 80px' : '48px 24px 80px',
      }}>

        {/* Welcome */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontFamily: 'Teko, sans-serif',
            fontSize: isMobile ? 32 : 48,
            fontWeight: 700,
            backgroundImage: 'linear-gradient(135deg, #D4AF37, #f5d76e)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            lineHeight: 1, marginBottom: 8,
          }}>
            AUCTION LOBBY
          </div>
          <div style={{ color: '#5a8ab0', fontSize: 14 }}>
            Welcome,{' '}
            <span style={{ color: '#D4AF37', fontWeight: 600 }}>
              {user?.displayName?.split(' ')[0]}
            </span>
            ! Ready to build your dream team? 🏏
          </div>
        </div>

        {/* ── CREATE / JOIN TABS ── */}
        <div style={{
          background: 'rgba(7,24,44,0.8)',
          border: '1px solid #1a3a5c',
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: 36,
        }}>

          {/* Tab buttons */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
          }}>
            {(['create', 'join'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: isMobile ? '16px' : '20px',
                  border: 'none',
                  borderBottom: `3px solid ${activeTab === tab ? '#D4AF37' : 'transparent'}`,
                  background: activeTab === tab
                    ? 'rgba(212,175,55,0.1)'
                    : 'transparent',
                  color: activeTab === tab ? '#D4AF37' : '#5a8ab0',
                  fontFamily: 'Teko, sans-serif',
                  fontWeight: 700,
                  fontSize: isMobile ? 20 : 26,
                  letterSpacing: 2,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {tab === 'create' ? '🏟️' : '🎟️'}
                {tab === 'create' ? 'CREATE ROOM' : 'JOIN ROOM'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: isMobile ? '24px 20px' : '32px 36px' }}>

            {/* CREATE ROOM */}
            {activeTab === 'create' && (
              <div>
                <div style={{
                  color: '#5a8ab0', fontSize: 13,
                  marginBottom: 24, lineHeight: 1.6,
                  textAlign: 'center',
                }}>
                  Create a private room and invite friends with a 6-letter code
                </div>

                {/* Room name input */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{
                    display: 'block',
                    color: '#5a8ab0', fontSize: 10,
                    letterSpacing: 3, textTransform: 'uppercase',
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 600, marginBottom: 8,
                  }}>
                    Room Name (optional)
                  </label>
                  <input
                    value={roomName}
                    onChange={e => setRoomName(e.target.value.slice(0, 30))}
                    placeholder={`${user?.displayName?.split(' ')[0]}'s Auction`}
                    style={{
                      width: '100%',
                      background: 'rgba(3,49,94,0.4)',
                      border: '1px solid #1a3a5c',
                      borderRadius: 10,
                      padding: '12px 16px',
                      color: '#ddeeff',
                      fontFamily: 'Rajdhani, sans-serif',
                      fontWeight: 600,
                      fontSize: 16,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'}
                    onBlur={e => e.target.style.borderColor = '#1a3a5c'}
                  />
                </div>

                {/* Public toggle */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  marginBottom: 24,
                  cursor: 'pointer',
                }}
                onClick={() => setIsPublic(p => !p)}
                >
                  <div>
                    <div style={{
                      fontFamily: 'Rajdhani, sans-serif',
                      fontWeight: 700, fontSize: 14, color: '#ddeeff',
                    }}>
                      🌐 Public Room
                    </div>
                    <div style={{ color: '#5a8ab0', fontSize: 12, marginTop: 2 }}>
                      Anyone can see and join your room
                    </div>
                  </div>
                  {/* Toggle switch */}
                  <div style={{
                    width: 44, height: 24, borderRadius: 12,
                    background: isPublic ? '#D4AF37' : '#1a3a5c',
                    position: 'relative', transition: 'background 0.2s',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: 3,
                      left: isPublic ? 23 : 3,
                      width: 18, height: 18,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s',
                    }} />
                  </div>
                </div>

                {createError && (
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    marginBottom: 16,
                    background: 'rgba(255,64,96,0.12)',
                    border: '1px solid rgba(255,64,96,0.4)',
                    color: '#ff4060',
                    fontSize: 14,
                    fontWeight: 600,
                  }}>
                    ⚠️ {createError}
                  </div>
                )}

                <button
                  onClick={handleCreateRoom}
                  disabled={creating}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: 12,
                    border: 'none',
                    backgroundImage: creating
                      ? 'none'
                      : 'linear-gradient(135deg, #D4AF37, #f5d76e)',
                    backgroundColor: creating ? '#1a3a5c' : 'transparent',
                    color: creating ? '#5a8ab0' : '#111',
                    fontFamily: 'Teko, sans-serif',
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: 2,
                    cursor: creating ? 'not-allowed' : 'pointer',
                    boxShadow: creating ? 'none' : '0 4px 20px rgba(212,175,55,0.4)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                  }}
                  onMouseEnter={e => {
                    if (!creating) {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 8px 28px rgba(212,175,55,0.5)'
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = creating
                      ? 'none' : '0 4px 20px rgba(212,175,55,0.4)'
                  }}
                >
                  {creating ? (
                    <>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.2)',
                        borderTopColor: '#D4AF37',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      Creating Room...
                    </>
                  ) : (
                    '🏟️ CREATE AUCTION ROOM'
                  )}
                </button>
              </div>
            )}

            {/* JOIN ROOM */}
            {activeTab === 'join' && (
              <div>
                <div style={{
                  color: '#5a8ab0', fontSize: 13,
                  marginBottom: 24, lineHeight: 1.6,
                  textAlign: 'center',
                }}>
                  Enter the 6-letter code from your host to join their auction
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{
                    display: 'block',
                    color: '#5a8ab0', fontSize: 10,
                    letterSpacing: 3, textTransform: 'uppercase',
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 600, marginBottom: 8,
                  }}>
                    Room Code
                  </label>
                  <input
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                    onKeyDown={e => e.key === 'Enter' && joinCode.length === 6 && handleJoinRoom()}
                    placeholder="ABC123"
                    maxLength={6}
                    style={{
                      width: '100%',
                      background: 'rgba(3,49,94,0.4)',
                      border: '1px solid #1a3a5c',
                      borderRadius: 10,
                      padding: '14px 20px',
                      color: '#D4AF37',
                      fontFamily: 'Teko, sans-serif',
                      fontSize: 36,
                      fontWeight: 700,
                      letterSpacing: 12,
                      textAlign: 'center',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'}
                    onBlur={e => e.target.style.borderColor = '#1a3a5c'}
                  />
                </div>

                {joinError && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                    background: 'rgba(255,64,96,0.1)',
                    border: '1px solid rgba(255,64,96,0.3)',
                    color: '#ff4060', fontSize: 13,
                  }}>
                    ⚠️ {joinError}
                  </div>
                )}

                <button
                  onClick={() => handleJoinRoom()}
                  disabled={joining || joinCode.length !== 6}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: 12,
                    border: 'none',
                    backgroundImage: joining || joinCode.length !== 6
                      ? 'none'
                      : 'linear-gradient(135deg, #D4AF37, #f5d76e)',
                    backgroundColor: joining || joinCode.length !== 6
                      ? '#1a3a5c' : 'transparent',
                    color: joining || joinCode.length !== 6 ? '#5a8ab0' : '#111',
                    fontFamily: 'Teko, sans-serif',
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: 2,
                    cursor: joining || joinCode.length !== 6
                      ? 'not-allowed' : 'pointer',
                    boxShadow: joinCode.length === 6 && !joining
                      ? '0 4px 20px rgba(212,175,55,0.4)' : 'none',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                  }}
                >
                  {joining ? (
                    <>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.2)',
                        borderTopColor: '#D4AF37',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      Joining...
                    </>
                  ) : (
                    '🎟️ JOIN AUCTION ROOM'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── PUBLIC ROOMS ── */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontWeight: 700, fontSize: 13,
                color: '#D4AF37', letterSpacing: 3,
                textTransform: 'uppercase',
              }}>
                🌐 Public Rooms
              </span>
              <span style={{
                padding: '2px 10px', borderRadius: 20,
                background: 'rgba(0,200,150,0.15)',
                border: '1px solid rgba(0,200,150,0.3)',
                color: '#00c896', fontSize: 10,
                fontWeight: 700, letterSpacing: 1,
              }}>
                LIVE
              </span>
            </div>
            <div style={{ color: '#5a8ab0', fontSize: 12 }}>
              Play with others
            </div>
          </div>

          {publicRooms.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              background: 'rgba(7,24,44,0.6)',
              border: '1px dashed rgba(212,175,55,0.15)',
              borderRadius: 16,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏟️</div>
              <div style={{
                fontFamily: 'Teko, sans-serif',
                fontSize: 22, color: '#5a8ab0',
              }}>
                No Public Rooms Yet
              </div>
              <div style={{ color: '#5a8ab0', fontSize: 13, marginTop: 6 }}>
                Create a public room to let others join!
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? '1fr'
                : 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 14,
            }}>
              {publicRooms.map(room => (
                <div
                  key={room.code}
                  style={{
                    background: 'rgba(7,24,44,0.85)',
                    border: '1px solid #1a3a5c',
                    borderRadius: 14,
                    padding: '18px 20px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#1a3a5c'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  {/* Room info */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10, marginBottom: 12,
                  }}>
                    <img
                      src={room.hostPhoto || ''}
                      style={{
                        width: 36, height: 36, borderRadius: '50%',
                        border: '1px solid rgba(212,175,55,0.3)',
                        objectFit: 'cover', flexShrink: 0,
                      }}
                      onError={e => {
                        (e.target as HTMLImageElement).src =
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(room.hostName)}&background=1a3a5c&color=D4AF37&bold=true`
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontFamily: 'Rajdhani, sans-serif',
                        fontWeight: 700, fontSize: 15,
                        color: '#ddeeff',
                      }}>
                        {room.hostName}'s Room
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        gap: 8, marginTop: 2,
                      }}>
                        <span style={{ color: '#5a8ab0', fontSize: 12 }}>
                          👥 {room.playerCount} joined
                        </span>
                        <span style={{
                          padding: '1px 8px', borderRadius: 20,
                          background: 'rgba(0,200,150,0.12)',
                          color: '#00c896', fontSize: 10,
                          fontWeight: 700,
                        }}>
                          OPEN
                        </span>
                      </div>
                    </div>
                    <div style={{
                      fontFamily: 'Teko, sans-serif',
                      fontSize: 18, color: '#D4AF37',
                      letterSpacing: 3,
                    }}>
                      {room.code}
                    </div>
                  </div>

                  {/* Join button */}
                  <button
                    onClick={() => handleJoinRoom(room.code)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: 10,
                      border: 'none',
                      backgroundImage: 'linear-gradient(135deg, #D4AF37, #f5d76e)',
                      color: '#111',
                      fontFamily: 'Teko, sans-serif',
                      fontWeight: 700,
                      fontSize: 18,
                      letterSpacing: 2,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    JOIN →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* How to play */}
        <div style={{
          marginTop: 40,
          padding: '24px',
          background: 'rgba(7,24,44,0.5)',
          border: '1px solid rgba(212,175,55,0.1)',
          borderRadius: 16,
        }}>
          <div style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700, fontSize: 11,
            color: '#D4AF37', letterSpacing: 3,
            textTransform: 'uppercase',
            marginBottom: 16, textAlign: 'center',
          }}>
            ✦ Quick Guide ✦
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 12,
          }}>
            {[
              { icon:'🏟️', title:'Create or Join', desc:'Create a private room or join a public one' },
              { icon:'⚙️', title:'Setup Auction', desc:'Host selects 250+ players for the pool' },
              { icon:'🔨', title:'Bid & Win', desc:'Bid in real-time, max ₹100Cr budget' },
            ].map((step, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '12px', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)',
              }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{step.icon}</span>
                <div>
                  <div style={{
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 700, fontSize: 14, color: '#D4AF37',
                    marginBottom: 4,
                  }}>
                    {step.title}
                  </div>
                  <div style={{ color: '#5a8ab0', fontSize: 12, lineHeight: 1.5 }}>
                    {step.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

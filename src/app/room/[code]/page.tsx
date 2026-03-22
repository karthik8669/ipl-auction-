'use client'

import { use, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { ref, onValue, off, update } from 'firebase/database'
import { auth, db } from '@/lib/firebase'
import { players as ALL_PLAYERS, Player } from '@/data/players'

export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = use(params)

  const [user, setUser] = useState<any>(null)
  const [roomState, setRoomState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showPlayerModal, setShowPlayerModal] = useState(false)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [playerSearch, setPlayerSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [natFilter, setNatFilter] = useState('All')
  const [windowWidth, setWindowWidth] = useState(1200)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth)
      const handleResize = () => setWindowWidth(window.innerWidth)
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  const isMobile = windowWidth < 768

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { window.location.href = '/'; return }
      setUser(u)
    })
    return () => unsub()
  }, [])

  // Join room + listen to state
  useEffect(() => {
    if (!user || !code) return

    // Add self to participants
    update(ref(db, `rooms/${code}/participants/${user.uid}`), {
      name: user.displayName || 'Player',
      email: user.email || '',
      photoURL: user.photoURL || '',
      budget: 100,
      overseas: 0,
      squadSize: 0,
      isReady: false,
      joinedAt: Date.now(),
    })

    // Listen to room
    const roomRef = ref(db, `rooms/${code}`)
    const unsub = onValue(roomRef, (snap) => {
      if (!snap.exists()) {
        setError('Room not found.')
        setLoading(false)
        return
      }
      const data = snap.val()
      setRoomState(data)
      setLoading(false)
      // Navigation handled by useEffect below — NOT here
    }, (err) => {
      setError(err.message)
      setLoading(false)
    })

    return () => off(roomRef)
  }, [user, code])

  // Navigate based on room status — separate from listener
  useEffect(() => {
    if (!roomState?.meta) return
    const status = roomState.meta.status
    if (status === 'auction') {
      window.location.replace(`/room/${code}/auction`)
    } else if (status === 'finished') {
      window.location.replace(`/room/${code}/results`)
    }
    // status === 'waiting' — stay on this page, do nothing
  }, [roomState?.meta?.status, code])

  async function handleCopyCode() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code.toUpperCase())
      } else {
        const ta = document.createElement('textarea')
        ta.value = code.toUpperCase()
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      alert(`Room Code: ${code.toUpperCase()}`)
    }
  }

  async function startAuction() {
    if (!isHost) return

    // Check pool exists
    const rawPool = roomState?.auction?.pool
    const pool = Array.isArray(rawPool)
      ? rawPool
      : Object.values(rawPool || {})

    if (pool.length === 0) {
      alert('Please configure players first! Click "Configure Players" button.')
      return
    }

    try {
      const updates: Record<string, any> = {}
      updates[`rooms/${code}/meta/status`] = 'auction'
      updates[`rooms/${code}/auction/currentIndex`] = 0
      updates[`rooms/${code}/auction/phase`] = 'bidding'
      updates[`rooms/${code}/auction/timerEnd`] = Date.now() + 15000
      updates[`rooms/${code}/auction/currentBid`] = 0
      updates[`rooms/${code}/auction/leaderId`] = ''
      updates[`rooms/${code}/auction/leaderName`] = ''
      updates[`rooms/${code}/auction/leaderPhoto`] = ''
      updates[`rooms/${code}/auction/bidHistory`] = []
      updates[`rooms/${code}/unsoldPlayers`] = []

      // Init teams and RTM for each participant
      Object.keys(roomState?.participants || {}).forEach(uid => {
        updates[`rooms/${code}/teams/${uid}`] = {}
        updates[`rooms/${code}/rtm/${uid}`] = {
          used: false,
          usedOn: null,
          usedAt: null,
        }
      })

      const { update: fbUpdate } = await import('firebase/database')
      await fbUpdate(ref(db), updates)

      // Navigate to auction after Firebase confirms write
      window.location.replace(`/room/${code}/auction`)

    } catch (e: any) {
      console.error('Start auction error:', e)
      alert('Failed to start auction: ' + e.message)
    }
  }

  async function savePool() {
    if (!isHost || selectedPlayerIds.size === 0) return
    try {
      const { update: fbUpdate } = await import('firebase/database')
      await fbUpdate(ref(db), {
        [`rooms/${code}/auction/pool`]: [...selectedPlayerIds],
      })
      setShowPlayerModal(false)
      console.log('Pool saved:', selectedPlayerIds.size, 'players')
    } catch (e: any) {
      console.error('Save pool error:', e)
      alert('Failed to save: ' + e.message)
    }
  }

  // Derived state
  const participants = Object.entries(roomState?.participants || {})

  const filteredPlayers = ALL_PLAYERS.filter((p: Player) => {
    if (roleFilter !== 'All' && p.role !== roleFilter) return false
    if (natFilter !== 'All' && p.nationality !== natFilter) return false
    if (playerSearch && !p.name.toLowerCase().includes(playerSearch.toLowerCase())) return false
    return true
  })
  const hostId = roomState?.meta?.hostId || ''
  const isHost = !!user?.uid && !!hostId && user.uid === hostId

  // Pool count
  const rawPool = roomState?.auction?.pool
  const pool = !rawPool
    ? []
    : Array.isArray(rawPool)
    ? rawPool
    : Object.values(rawPool)
  const poolCount = pool.length

  console.log('isHost check:', {
    userUid: user?.uid,
    hostId,
    isHost,
    poolCount,
  })

  // ── LOADING ──
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#030c18',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid rgba(212,175,55,0.15)',
            borderTopColor: '#D4AF37',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <div style={{
            fontFamily: 'Teko, sans-serif',
            fontSize: 22, color: '#D4AF37', letterSpacing: 4,
          }}>
            LOADING ROOM...
          </div>
        </div>
      </div>
    )
  }

  // ── ERROR ──
  if (error) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#030c18', padding: 20,
      }}>
        <div style={{
          textAlign: 'center', padding: '40px 32px',
          background: '#07182c',
          border: '1px solid rgba(255,64,96,0.3)',
          borderRadius: 20, maxWidth: 420,
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
          <div style={{
            fontFamily: 'Teko, sans-serif',
            fontSize: 28, color: '#ff4060', marginBottom: 12,
          }}>
            {error}
          </div>
          <button
            onClick={() => window.location.href = '/lobby'}
            style={{
              padding: '12px 28px', borderRadius: 10, border: 'none',
              backgroundImage: 'linear-gradient(135deg, #D4AF37, #f5d76e)',
              color: '#111', fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 700, fontSize: 16, cursor: 'pointer',
            }}
          >
            Back to Lobby
          </button>
        </div>
      </div>
    )
  }

  // ── MAIN WAITING ROOM ──
  return (
    <div style={{
      minHeight: '100vh',
      background: '#030c18',
      backgroundImage: `
        radial-gradient(ellipse at 20% 20%, rgba(0,65,120,0.2) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(212,175,55,0.06) 0%, transparent 50%)
      `,
      fontFamily: 'Inter, sans-serif',
      color: '#ddeeff',
    }}>

      {/* Navbar */}
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
          <span style={{ fontFamily: 'Teko,sans-serif', fontSize: 26, color: '#D4AF37', letterSpacing: 4 }}>
            🏏 IPL
          </span>
          {!isMobile && (
            <span style={{
              fontFamily: 'Teko,sans-serif', fontSize: 14,
              color: '#5a8ab0', letterSpacing: 3,
            }}>AUCTION 2026</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#00c896',
            boxShadow: '0 0 0 3px rgba(0,200,150,0.2)',
          }} />
          <span style={{
            color: '#00c896', fontSize: 11,
            fontFamily: 'Rajdhani,sans-serif',
            fontWeight: 700, letterSpacing: 2,
          }}>
            LIVE LOBBY
          </span>
          {isHost && (
            <span style={{
              padding: '3px 10px', borderRadius: 20,
              background: 'rgba(212,175,55,0.15)',
              border: '1px solid rgba(212,175,55,0.3)',
              color: '#D4AF37', fontSize: 11,
              fontFamily: 'Rajdhani,sans-serif', fontWeight: 700,
            }}>
              HOST
            </span>
          )}
        </div>

        <button
          onClick={() => window.location.href = '/lobby'}
          style={{
            padding: '7px 16px', borderRadius: 8,
            border: '1px solid #1a3a5c',
            background: 'transparent', color: '#5a8ab0',
            fontFamily: 'Rajdhani,sans-serif', fontWeight: 600,
            fontSize: 13, cursor: 'pointer',
          }}
        >
          ← Leave
        </button>
      </nav>

      <div style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: isMobile ? '24px 16px 80px' : '40px 24px 80px',
      }}>

        {/* ── ROOM CODE BOX ── */}
        <div style={{
          textAlign: 'center',
          padding: isMobile ? '28px 20px' : '40px 32px',
          background: 'rgba(212,175,55,0.04)',
          border: '2px dashed rgba(212,175,55,0.25)',
          borderRadius: 20,
          marginBottom: 28,
        }}>
          <div style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700, fontSize: 10,
            color: '#5a8ab0', letterSpacing: 4,
            textTransform: 'uppercase', marginBottom: 16,
          }}>
            ✦ Share This Code With Your Friends ✦
          </div>

          {/* BIG ROOM CODE */}
          <div
            onClick={handleCopyCode}
            style={{
              fontFamily: 'Teko, sans-serif',
              fontSize: isMobile ? 56 : 88,
              fontWeight: 700,
              letterSpacing: isMobile ? 12 : 20,
              backgroundImage: 'linear-gradient(135deg, #D4AF37, #f5d76e)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: 1,
              cursor: 'pointer',
              userSelect: 'all',
              filter: 'drop-shadow(0 0 20px rgba(212,175,55,0.3))',
            }}
          >
            {code.toUpperCase()}
          </div>

          <div style={{
            color: '#5a8ab0', fontSize: 12,
            marginTop: 8, marginBottom: 20,
          }}>
            {copied ? '✅ Copied!' : 'Click the code or button below to copy'}
          </div>

          <button
            onClick={handleCopyCode}
            style={{
              padding: '10px 28px', borderRadius: 8,
              border: `1px solid ${copied ? 'rgba(0,200,150,0.5)' : 'rgba(212,175,55,0.4)'}`,
              background: copied ? 'rgba(0,200,150,0.1)' : 'rgba(212,175,55,0.08)',
              color: copied ? '#00c896' : '#D4AF37',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 700, fontSize: 14,
              cursor: 'pointer', letterSpacing: 1,
              transition: 'all 0.2s',
            }}
          >
            {copied ? '✅ Copied!' : '📋 Copy Room Code'}
          </button>
        </div>

        {/* ── PLAYERS IN ROOM ── */}
        <div style={{
          background: 'rgba(7,24,44,0.8)',
          border: '1px solid #1a3a5c',
          borderRadius: 16,
          padding: isMobile ? '20px 16px' : '24px',
          marginBottom: 24,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 16,
          }}>
            <div style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 700, fontSize: 12,
              color: '#D4AF37', letterSpacing: 3,
              textTransform: 'uppercase',
            }}>
              Players in Room ({participants.length})
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#00c896',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
              <span style={{ color: '#00c896', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
                LIVE
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {participants.map(([uid, p]: [string, any]) => (
              <div key={uid} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                background: uid === user?.uid
                  ? 'rgba(212,175,55,0.06)'
                  : 'rgba(13,34,64,0.5)',
                border: `1px solid ${uid === user?.uid
                  ? 'rgba(212,175,55,0.2)' : '#1a3a5c'}`,
                borderRadius: 12,
              }}>
                <img
                  src={p.photoURL || ''}
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    objectFit: 'cover', flexShrink: 0,
                    border: `2px solid ${uid === hostId ? '#D4AF37' : '#1a3a5c'}`,
                  }}
                  onError={e => {
                    (e.target as HTMLImageElement).src =
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1a3a5c&color=D4AF37&bold=true`
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'Rajdhani,sans-serif',
                    fontWeight: 700, fontSize: 16, color: '#ddeeff',
                  }}>
                    {p.name}
                  </div>
                  <div style={{ color: '#5a8ab0', fontSize: 12, marginTop: 2 }}>
                    ₹{p.budget} Cr budget
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {uid === hostId && (
                    <span style={{
                      padding: '3px 12px', borderRadius: 20,
                      background: 'rgba(212,175,55,0.15)',
                      border: '1px solid rgba(212,175,55,0.3)',
                      color: '#D4AF37', fontSize: 11,
                      fontFamily: 'Rajdhani,sans-serif', fontWeight: 700,
                      letterSpacing: 1,
                    }}>
                      HOST
                    </span>
                  )}
                  {uid === user?.uid && uid !== hostId && (
                    <span style={{
                      padding: '3px 12px', borderRadius: 20,
                      background: 'rgba(0,200,150,0.12)',
                      border: '1px solid rgba(0,200,150,0.2)',
                      color: '#00c896', fontSize: 11,
                      fontFamily: 'Rajdhani,sans-serif', fontWeight: 700,
                      letterSpacing: 1,
                    }}>
                      YOU
                    </span>
                  )}
                </div>
              </div>
            ))}

            {participants.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '24px',
                color: '#5a8ab0', fontSize: 14, fontStyle: 'italic',
              }}>
                Waiting for players to join...
              </div>
            )}
          </div>
        </div>

      </div>{/* end maxWidth scroll container */}

      {/* HOST CONTROLS — sticky bottom bar */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        background: 'rgba(3,12,24,0.98)',
        borderTop: '1px solid #1a3a5c',
        padding: '16px',
        zIndex: 20,
      }}>
        {isHost ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: poolCount > 0 ? '1fr 1fr' : '1fr',
            gap: 12,
            maxWidth: 760,
            margin: '0 auto',
          }}>
            <button
              onClick={() => setShowPlayerModal(true)}
              style={{
                padding: '16px',
                borderRadius: 12,
                background: 'rgba(13,34,64,0.9)',
                border: '1px solid rgba(212,175,55,0.3)',
                color: '#D4AF37',
                fontFamily: 'Teko, sans-serif',
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: 2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              ⚙️ CONFIGURE PLAYERS
              {poolCount > 0 && (
                <span style={{
                  padding: '2px 10px',
                  borderRadius: 20,
                  background: 'rgba(212,175,55,0.2)',
                  color: '#D4AF37',
                  fontSize: 12,
                }}>
                  {poolCount} selected
                </span>
              )}
            </button>

            {poolCount > 0 && (
              <button
                onClick={startAuction}
                style={{
                  padding: '16px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundImage: 'linear-gradient(135deg, #D4AF37, #f5d76e)',
                  color: '#111',
                  fontFamily: 'Teko, sans-serif',
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: 2,
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(212,175,55,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                🔨 START AUCTION
              </button>
            )}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            color: '#5a8ab0',
            fontSize: 13,
            padding: '8px',
          }}>
            ⏳ Waiting for host to start the auction...
          </div>
        )}
      </div>

      {/* ── PLAYER SELECTION MODAL ── */}
      {showPlayerModal && isHost && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Modal header */}
          <div style={{
            background: 'rgba(3,12,24,0.98)',
            borderBottom: '1px solid #1a3a5c',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div>
              <div style={{
                fontFamily: 'Teko, sans-serif',
                fontSize: 26, color: '#D4AF37', letterSpacing: 2,
              }}>
                ⚙️ Configure Auction Pool
              </div>
              <div style={{ color: '#5a8ab0', fontSize: 12, marginTop: 2 }}>
                {selectedPlayerIds.size} players selected
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelectedPlayerIds(new Set(ALL_PLAYERS.map(p => p.id)))}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid rgba(212,175,55,0.3)',
                  background: 'rgba(212,175,55,0.08)',
                  color: '#D4AF37', fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >
                Select All ({ALL_PLAYERS.length})
              </button>
              <button
                onClick={() => setSelectedPlayerIds(new Set())}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid rgba(255,64,96,0.3)',
                  background: 'rgba(255,64,96,0.06)',
                  color: '#ff4060', fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >
                Clear
              </button>
              <button
                onClick={savePool}
                disabled={selectedPlayerIds.size === 0}
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  border: 'none',
                  background: selectedPlayerIds.size > 0
                    ? 'linear-gradient(135deg, #D4AF37, #f5d76e)'
                    : '#1a3a5c',
                  color: selectedPlayerIds.size > 0 ? '#111' : '#5a8ab0',
                  fontFamily: 'Teko, sans-serif', fontWeight: 700,
                  fontSize: 18, letterSpacing: 2,
                  cursor: selectedPlayerIds.size > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                SAVE ({selectedPlayerIds.size})
              </button>
              <button
                onClick={() => setShowPlayerModal(false)}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: '1px solid #1a3a5c',
                  background: 'transparent', color: '#5a8ab0',
                  fontSize: 18, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid #1a3a5c',
            display: 'flex', flexWrap: 'wrap', gap: 8,
            background: 'rgba(7,24,44,0.8)',
            flexShrink: 0,
          }}>
            <input
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              placeholder="Search player..."
              style={{
                background: 'rgba(3,49,94,0.4)',
                border: '1px solid #1a3a5c',
                borderRadius: 8, padding: '7px 12px',
                color: '#ddeeff', fontFamily: 'Inter, sans-serif',
                fontSize: 13, outline: 'none', minWidth: 180,
              }}
            />
            {['All','Batsman','Bowler','All-Rounder','WK-Batsman'].map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1px solid ${roleFilter===r?'#D4AF37':'#1a3a5c'}`,
                  background: roleFilter===r?'rgba(212,175,55,0.15)':'transparent',
                  color: roleFilter===r?'#D4AF37':'#5a8ab0',
                  fontFamily: 'Rajdhani, sans-serif', fontWeight: 600,
                  fontSize: 12, cursor: 'pointer', letterSpacing: 1,
                }}
              >
                {r}
              </button>
            ))}
            {['All','Indian','Overseas'].map(n => (
              <button
                key={n}
                onClick={() => setNatFilter(n)}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1px solid ${natFilter===n?'#D4AF37':'#1a3a5c'}`,
                  background: natFilter===n?'rgba(212,175,55,0.15)':'transparent',
                  color: natFilter===n?'#D4AF37':'#5a8ab0',
                  fontFamily: 'Rajdhani, sans-serif', fontWeight: 600,
                  fontSize: 12, cursor: 'pointer', letterSpacing: 1,
                }}
              >
                {n==='Indian'?'🇮🇳 Indian':n==='Overseas'?'🌏 Overseas':'All'}
              </button>
            ))}
            <span style={{ color:'#5a8ab0', fontSize:12, marginLeft:'auto', alignSelf:'center' }}>
              {filteredPlayers.length} players
            </span>
          </div>

          {/* Player grid */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '16px 20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 10,
            alignContent: 'start',
          }}>
            {filteredPlayers.map(player => {
              const selected = selectedPlayerIds.has(player.id)
              const roleColors: Record<string, {color: string, bg: string}> = {
                'Batsman':     { color:'#00c896', bg:'rgba(0,200,150,0.1)'  },
                'Bowler':      { color:'#ff4060', bg:'rgba(255,64,96,0.1)'  },
                'All-Rounder': { color:'#b57bee', bg:'rgba(155,89,182,0.1)' },
                'WK-Batsman':  { color:'#ff8c00', bg:'rgba(255,140,0,0.1)'  },
              }
              const rc = roleColors[player.role] || roleColors['Batsman']

              return (
                <div
                  key={player.id}
                  onClick={() => {
                    const next = new Set(selectedPlayerIds)
                    next.has(player.id) ? next.delete(player.id) : next.add(player.id)
                    setSelectedPlayerIds(next)
                  }}
                  style={{
                    background: selected ? 'rgba(212,175,55,0.1)' : 'rgba(7,24,44,0.9)',
                    border: `2px solid ${selected ? '#D4AF37' : '#1a3a5c'}`,
                    borderRadius: 12, padding: '12px',
                    cursor: 'pointer', position: 'relative',
                    transition: 'all 0.15s',
                  }}
                >
                  {selected && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 20, height: 20, borderRadius: '50%',
                      background: '#D4AF37', color: '#111',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 11, fontWeight: 900,
                    }}>✓</div>
                  )}
                  <div style={{
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 800, fontSize: 14,
                    color: '#ffffff', marginBottom: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {player.name}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    gap: 6, marginBottom: 8,
                  }}>
                    <span style={{ fontSize: 12 }}>
                      {player.nationality === 'Indian' ? '🇮🇳' : '🌏'}
                    </span>
                    <span style={{
                      fontSize: 9, padding: '1px 7px', borderRadius: 20,
                      background: rc.bg, color: rc.color,
                      fontFamily: 'Rajdhani, sans-serif',
                      fontWeight: 700, letterSpacing: 1,
                    }}>
                      {player.role === 'WK-Batsman' ? 'WK' :
                       player.role === 'All-Rounder' ? 'AR' :
                       player.role === 'Batsman' ? 'BAT' : 'BOWL'}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: 'Teko, sans-serif',
                    fontSize: 16, color: '#D4AF37',
                  }}>
                    {player.basePrice >= 1
                      ? `₹${player.basePrice.toFixed(1)}Cr`
                      : `₹${Math.round(player.basePrice*100)}L`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

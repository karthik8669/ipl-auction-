'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function LandingPage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)

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
  const isTablet = windowWidth >= 768 && windowWidth < 1024

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/lobby')
      } else {
        setAuthLoading(false)
      }
    })
    return () => unsub()
  }, [mounted, router])

  async function handleSignIn() {
    setSigningIn(true)
    setError('')
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (e: any) {
      setError(e?.message || 'Sign in failed. Please try again.')
      setSigningIn(false)
    }
  }

  if (!mounted || authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#030c18',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: '3px solid rgba(212,175,55,0.15)',
            borderTopColor: '#D4AF37',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 20px',
          }} />
          <div style={{
            fontFamily: 'Teko, sans-serif',
            fontSize: 22,
            color: '#D4AF37',
            letterSpacing: 6,
          }}>
            LOADING...
          </div>
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
        radial-gradient(ellipse at 20% 20%, rgba(0,65,120,0.3) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(212,175,55,0.08) 0%, transparent 50%)
      `,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: 'Inter, sans-serif',
      position: 'relative',
      overflowX: 'hidden',
      textAlign: 'center',
    }}>

      {/* Stadium background */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: `url('https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1920&q=60')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.05,
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Floating decorations */}
      {[
        { emoji: '🏏', top: '8%',  left: '4%',  size: 44, delay: '0s'   },
        { emoji: '🏆', top: '12%', right: '5%', size: 40, delay: '0.5s' },
        { emoji: '🎯', top: '60%', left: '3%',  size: 32, delay: '1s'   },
        { emoji: '⚡', top: '70%', right: '4%', size: 36, delay: '1.5s' },
      ].map((el, i) => (
        <div
          key={i}
          style={{
            position: 'fixed',
            display: isMobile ? 'none' : 'block',
            top: el.top,
            left: (el as any).left,
            right: (el as any).right,
            fontSize: el.size,
            opacity: 0.12,
            animation: `float ${3 + i * 0.4}s ease-in-out ${el.delay} infinite`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          {el.emoji}
        </div>
      ))}

      {/* Top nav */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        padding: isMobile ? '10px 16px' : '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
        background: 'rgba(3,12,24,0.6)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🏏</span>
          <span style={{ fontFamily: 'Teko, sans-serif', fontSize: 22, color: '#D4AF37', letterSpacing: 4 }}>
            IPL
          </span>
          <span style={{ display: isMobile ? 'none' : 'inline', fontFamily: 'Teko, sans-serif', fontSize: 14, color: '#5a8ab0', letterSpacing: 3 }}>
            AUCTION
          </span>
        </div>
        <div style={{
          display: isMobile ? 'none' : 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 14px',
          borderRadius: 20,
          background: 'rgba(0,200,150,0.08)',
          border: '1px solid rgba(0,200,150,0.2)',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#00c896',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <span style={{
            color: '#00c896', fontSize: 10,
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700, letterSpacing: 2,
          }}>
            SEASON 2026
          </span>
        </div>
      </div>

      {/* ── MAIN CONTENT — perfectly centered ── */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        width: '100%',
        maxWidth: isMobile ? '100%' : '680px',
        margin: '0 auto',
        padding: isMobile ? '80px 20px 40px' : '100px 20px 60px',
      }}>

        {/* Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: isMobile ? '4px 14px' : '5px 20px',
          borderRadius: 20,
          background: 'rgba(212,175,55,0.1)',
          border: '1px solid rgba(212,175,55,0.3)',
          marginBottom: 28,
          animation: 'fadeInUp 0.6s ease-out both',
        }}>
          <span style={{ fontSize: 13 }}>🏆</span>
          <span style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700, fontSize: isMobile ? 10 : 11,
            color: '#D4AF37', letterSpacing: 3,
          }}>
            MULTIPLAYER AUCTION GAME
          </span>
          <span style={{ fontSize: 13 }}>🏆</span>
        </div>

        {/* IPL — giant centered */}
        <div style={{
          fontFamily: 'Teko, sans-serif',
          fontSize: isMobile ? '72px' : 'clamp(96px, 18vw, 160px)',
          fontWeight: 700,
          lineHeight: 0.85,
          backgroundImage: 'linear-gradient(135deg, #D4AF37 0%, #f5d76e 35%, #fffbe6 55%, #D4AF37 100%)',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: isMobile ? 6 : 12,
          filter: 'drop-shadow(0 0 50px rgba(212,175,55,0.35))',
          animation: 'fadeInUp 0.8s ease-out 0.1s both',
          textAlign: 'center',
          width: '100%',
          display: 'block',
        }}>
          IPL
        </div>

        {/* AUCTION 2026 */}
        <div style={{
          fontFamily: 'Teko, sans-serif',
          fontSize: isMobile ? '16px' : 'clamp(18px, 3.5vw, 26px)',
          fontWeight: 400,
          color: '#5a8ab0',
          letterSpacing: isMobile ? 6 : 14,
          marginTop: 4,
          marginBottom: 28,
          textAlign: 'center',
          width: '100%',
          animation: 'fadeInUp 0.8s ease-out 0.2s both',
        }}>
          AUCTION 2026
        </div>

        {/* Description */}
        <p style={{
          fontSize: isMobile ? '14px' : '17px',
          color: '#5a8ab0',
          lineHeight: 1.8,
          marginBottom: 40,
          maxWidth: isMobile ? '100%' : 480,
          padding: isMobile ? '0 8px' : 0,
          textAlign: 'center',
          animation: 'fadeInUp 0.8s ease-out 0.3s both',
        }}>
          Bid on{' '}
          <span style={{ color: '#D4AF37', fontWeight: 600 }}>250+ real IPL players</span>
          {' '}with your friends in real-time.
          Build your dream squad for{' '}
          <span style={{ color: '#D4AF37', fontWeight: 600 }}>₹100 Crore</span>.
        </p>

        {/* ── SIGN IN BUTTON ── */}
        <div style={{
          animation: 'fadeInUp 0.8s ease-out 0.4s both',
          marginBottom: 12,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              padding: isMobile ? '14px 24px' : '16px 44px',
              borderRadius: 14,
              border: 'none',
              backgroundImage: signingIn
                ? 'none'
                : 'linear-gradient(135deg, #D4AF37 0%, #f5d76e 50%, #D4AF37 100%)',
              backgroundColor: signingIn ? '#1a3a5c' : 'transparent',
              backgroundSize: '200% auto',
              color: signingIn ? '#5a8ab0' : '#0a0e00',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 700,
              fontSize: isMobile ? '16px' : '19px',
              width: isMobile ? '100%' : 'auto',
              letterSpacing: 2,
              cursor: signingIn ? 'not-allowed' : 'pointer',
              boxShadow: signingIn ? 'none' : '0 6px 32px rgba(212,175,55,0.45)',
              transition: 'all 0.25s',
              opacity: signingIn ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!signingIn) {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(212,175,55,0.6)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = signingIn
                ? 'none' : '0 6px 32px rgba(212,175,55,0.45)'
            }}
          >
            {signingIn ? (
              <>
                <div style={{
                  width: 20, height: 20,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.15)',
                  borderTopColor: '#D4AF37',
                  animation: 'spin 0.8s linear infinite',
                  flexShrink: 0,
                }} />
                Signing in...
              </>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google to Play
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 20px',
            borderRadius: 10,
            background: 'rgba(255,64,96,0.1)',
            border: '1px solid rgba(255,64,96,0.3)',
            color: '#ff4060',
            fontSize: 13,
            marginBottom: 16,
            maxWidth: 400,
            animation: 'fadeInUp 0.3s ease-out',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── STATS ROW ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)',
          gap: isMobile ? 8 : 10,
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 36,
          marginBottom: 40,
          width: '100%',
          animation: 'fadeInUp 0.8s ease-out 0.5s both',
        }}>
          {[
            { icon: '🏏', num: '250+',   label: 'Players'   },
            { icon: '💰', num: '₹100Cr', label: 'Budget'    },
            { icon: '🌏', num: '8 Max',  label: 'Overseas'  },
            { icon: '👥', num: '10+',    label: 'Per Room'  },
            { icon: '🤖', num: 'AI',     label: 'Analysis'  },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: '14px 18px',
                background: 'rgba(7,24,44,0.85)',
                border: '1px solid rgba(212,175,55,0.12)',
                borderRadius: 14,
                textAlign: 'center',
                minWidth: 88,
                backdropFilter: 'blur(10px)',
                transition: 'all 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)'
                e.currentTarget.style.transform = 'translateY(-3px)'
                e.currentTarget.style.background = 'rgba(212,175,55,0.08)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)'
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.background = 'rgba(7,24,44,0.85)'
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
              <div style={{
                fontFamily: 'Teko, sans-serif',
                fontSize: 24, color: '#D4AF37', lineHeight: 1,
              }}>
                {s.num}
              </div>
              <div style={{
                color: '#5a8ab0', fontSize: 10,
                letterSpacing: 1, marginTop: 3,
                fontFamily: 'Rajdhani, sans-serif',
                fontWeight: 600, textTransform: 'uppercase',
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── HOW IT WORKS ── */}
        <div style={{
          width: '100%',
          animation: 'fadeInUp 0.8s ease-out 0.6s both',
        }}>
          <div style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700, fontSize: 11,
            letterSpacing: 4, color: '#5a8ab0',
            textTransform: 'uppercase',
            marginBottom: 16, textAlign: 'center',
          }}>
            ✦ How It Works ✦
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: isMobile ? 10 : 12,
            width: '100%',
          }}>
            {[
              {
                step: '01', icon: '🏟️',
                title: 'Create Room',
                desc: 'Host creates room with 6-letter code',
                color: '#D4AF37',
              },
              {
                step: '02', icon: '⚙️',
                title: 'Pick Players',
                desc: 'Select from 250+ real IPL stars',
                color: '#4da6ff',
              },
              {
                step: '03', icon: '🔨',
                title: 'Live Bidding',
                desc: 'Bid in real-time, timer resets on each bid',
                color: '#00c896',
              },
              {
                step: '04', icon: '🏆',
                title: 'AI Verdict',
                desc: 'AI analyzes and picks the best squad',
                color: '#b57bee',
              },
            ].map((step, i) => (
              <div
                key={i}
                style={{
                  padding: '18px 14px',
                  background: 'rgba(7,24,44,0.75)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 14,
                  textAlign: 'left',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-3px)'
                  e.currentTarget.style.borderColor = `${step.color}30`
                  e.currentTarget.style.background = `${step.color}08`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.background = 'rgba(7,24,44,0.75)'
                }}
              >
                {/* Step watermark */}
                <div style={{
                  position: 'absolute', top: -8, right: 8,
                  fontFamily: 'Teko, sans-serif',
                  fontSize: 64, fontWeight: 700,
                  color: 'rgba(255,255,255,0.025)',
                  lineHeight: 1, pointerEvents: 'none',
                }}>
                  {step.step}
                </div>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{step.icon}</div>
                <div style={{
                  fontFamily: 'Teko, sans-serif',
                  fontSize: 20, color: step.color,
                  lineHeight: 1, marginBottom: 6,
                }}>
                  {step.title}
                </div>
                <div style={{
                  color: '#5a8ab0', fontSize: 11, lineHeight: 1.6,
                }}>
                  {step.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 40,
          color: 'rgba(90,138,176,0.4)',
          fontSize: 11,
          letterSpacing: 2,
          fontFamily: 'Rajdhani, sans-serif',
          textAlign: 'center',
          animation: 'fadeInUp 0.8s ease-out 0.8s both',
        }}>
          🏏 IPL AUCTION 2026 · Made by Kartik Jain
        </div>
      </div>
    </div>
  )
}

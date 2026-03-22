'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#030c18',
      padding: 20,
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        textAlign: 'center',
        padding: '40px 32px',
        background: '#07182c',
        border: '1px solid rgba(255,64,96,0.3)',
        borderRadius: 20,
        maxWidth: 480,
        width: '100%',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
        <div style={{
          fontFamily: 'Teko, sans-serif',
          fontSize: 36,
          color: '#ff4060',
          marginBottom: 12,
        }}>
          Something Went Wrong
        </div>
        <p style={{
          color: '#5a8ab0',
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 8,
        }}>
          {error?.message || 'An unexpected error occurred'}
        </p>
        {error?.digest && (
          <p style={{ color: '#1a3a5c', fontSize: 11, marginBottom: 24 }}>
            Error ID: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '12px 28px',
              borderRadius: 10,
              border: 'none',
              backgroundImage: 'linear-gradient(135deg, #D4AF37, #f5d76e)',
              color: '#111',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            Try Again
          </button>
          
          <a
            href="/"
            style={{
              padding: '12px 28px',
              borderRadius: 10,
              border: '1px solid #1a3a5c',
              background: 'transparent',
              color: '#5a8ab0',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  )
}

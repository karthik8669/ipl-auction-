'use client'

import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { MadeByBadge } from './MadeByBadge'

export function ClientProviders() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#07182c',
            border: '1px solid #1a3a5c',
            color: '#ddeeff',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 600,
            fontSize: 14,
          },
          success: {
            iconTheme: { primary: '#D4AF37', secondary: '#111' },
          },
          error: {
            iconTheme: { primary: '#ff4060', secondary: '#fff' },
          },
        }}
      />
      <MadeByBadge />
    </>
  )
}

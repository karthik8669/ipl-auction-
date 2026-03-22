'use client'
import { useRef, useState, useEffect } from 'react'
import html2canvas from 'html2canvas'
import { Player, getEspnId } from '@/data/players'
import { formatCr } from '@/lib/budgetGuard'

export function SquadCardGenerator({
  team, franchise
}: {
  team: { uid: string, name: string, players: (Player & { soldFor: number })[], budget: number, totalSpent: number, overseas: number },
  franchise: { name: string, color: string, logo: string }
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
      setCanShare(true)
    }
  }, [])

  async function handleDownload() {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: '#030c18',
        useCORS: true,
      })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `${franchise.name}-squad.png`
      a.click()
    } catch(e) {
      console.error(e)
    } finally {
      setDownloading(false)
    }
  }

  async function handleShare() {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: '#030c18', useCORS: true })
      canvas.toBlob(async (blob) => {
        if (!blob) return
        const file = new File([blob], 'squad.png', { type: 'image/png' })
        if (canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `${franchise.name} Squad`,
            text: `Check out my IPL 2026 squad for ${franchise.name}!`,
            files: [file]
          })
        } else {
          handleDownload()
        }
      })
    } catch (e) {
      console.error(e)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{
            padding: '10px 24px', borderRadius: 8,
            background: `linear-gradient(135deg, ${franchise.color}, ${franchise.color}cc)`,
            color: '#111', fontFamily: 'Rajdhani', fontWeight: 700,
            border: 'none', cursor: downloading ? 'wait' : 'pointer',
            letterSpacing: 1, boxShadow: `0 4px 16px ${franchise.color}40`,
          }}
        >
          {downloading ? '⏳ GENERATING...' : '⬇️ DOWNLOAD CARD'}
        </button>
        {canShare && (
          <button
            onClick={handleShare}
            disabled={downloading}
            style={{
              padding: '10px 24px', borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${franchise.color}`,
              color: franchise.color, fontFamily: 'Rajdhani', fontWeight: 700,
              cursor: downloading ? 'wait' : 'pointer',
              letterSpacing: 1,
            }}
          >
            📤 SHARE
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 20 }}>
        {/* The actual card that gets captured */}
        <div ref={cardRef} style={{
          width: 800, padding: 40,
          background: '#030c18',
          position: 'relative',
          border: `1px solid ${franchise.color}40`,
        }}>
          {/* Background decoration */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundImage: `radial-gradient(ellipse at center, ${franchise.color}15 0%, transparent 70%)`,
            zIndex: 0,
          }}/>
          
          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30, borderBottom: `2px solid ${franchise.color}40`, paddingBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 64 }}>{franchise.logo}</div>
                <div>
                  <div style={{ fontFamily: 'Teko', fontSize: 64, color: franchise.color, lineHeight: 0.9, letterSpacing: 2 }}>{franchise.name}</div>
                  <div style={{ fontFamily: 'Rajdhani', color: '#ddeeff', fontSize: 18, letterSpacing: 4, textTransform: 'uppercase' }}>Official Final Squad</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Teko', fontSize: 36, color: '#D4AF37', lineHeight: 1 }}>IPL 2026</div>
                <div style={{ color: '#5a8ab0', fontSize: 14 }}>{team.players.length} Players · {team.overseas} Overseas</div>
              </div>
            </div>

            {/* Players Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {team.players.sort((a,b) => b.soldFor - a.soldFor).map((p, i) => {
                const espnId = getEspnId(p.id);
                return (
                <div key={p.id} style={{
                  background: 'rgba(13,34,64,0.6)',
                  border: `1px solid ${i < 3 ? franchise.color : '#1a3a5c'}`,
                  borderRadius: 12, padding: 12,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {i < 3 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: franchise.color }}/>}
                  <img src={espnId ? `https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${espnId}.png` : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1a3a5c&color=D4AF37`} 
                       alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', marginBottom: 12, border: `3px solid ${i < 3 ? franchise.color : '#1a3a5c'}` }} crossOrigin="anonymous"/>
                  <div style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 16, color: '#ddeeff', lineHeight: 1.1, marginBottom: 4 }}>{p.name} {p.nationality === 'Indian' ? '🇮🇳' : '🌏'}</div>
                  <div style={{ color: '#5a8ab0', fontSize: 11, marginBottom: 8 }}>{p.role}</div>
                  <div style={{ fontFamily: 'Teko', fontSize: 24, color: i < 3 ? franchise.color : '#D4AF37', lineHeight: 1 }}>{formatCr(p.soldFor)}</div>
                </div>
              )})}
            </div>

            {/* Footer */}
            <div style={{ marginTop: 30, textAlign: 'center', color: '#5a8ab0', fontSize: 12, fontFamily: 'Rajdhani', letterSpacing: 2 }}>
              Generated by IPL Auction 2026 Simulator
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

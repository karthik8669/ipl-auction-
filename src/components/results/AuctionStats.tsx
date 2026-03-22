'use client'
import { useMemo } from 'react'
import { RoomState } from '@/types/room'
import { players as ALL_PLAYERS } from '@/data/players'
import { formatCr } from '@/lib/budgetGuard'

export function AuctionStats({ roomState }: { roomState: RoomState }) {
  const stats = useMemo(() => {
    let mostExpensive: any = null
    let maxPrice = 0
    let mostOverpaid: any = null
    let maxDiff = 0
    let bestBargain: any = null
    let minDiff = Infinity

    let biggestSpenderId = ''
    let maxSpent = 0
    let mostFrugalId = ''
    let minSpent = Infinity
    let mostTalkativeId = ''
    let maxMessages = 0

    // 1. Player Stats
    Object.values(roomState?.teams || {}).forEach(team => {
      Object.entries(team).forEach(([playerId, player]) => {
        const baseData = ALL_PLAYERS.find(p => p.id === playerId)
        if (!baseData) return

        const price = player.soldFor
        const base = baseData.basePrice

        if (price > maxPrice) {
          maxPrice = price
          mostExpensive = { ...baseData, soldFor: price }
        }

        const diff = price - (base || 0)
        if (base && diff > maxDiff) {
          maxDiff = diff
          mostOverpaid = { ...baseData, diff }
        }

        if (price >= 0 && base && price - base < minDiff && price >= base) {
          minDiff = price - base
          bestBargain = { ...baseData, diff: price - base }
        }
      })
    })

    // 2. Participant Stats
    Object.entries(roomState?.participants || {}).forEach(([uid, p]) => {
      const spent = 100 - (p.budget || 0)
      if (spent > maxSpent) {
        maxSpent = spent
        biggestSpenderId = uid
      }
      if (spent < minSpent && spent > 0) {
        minSpent = spent
        mostFrugalId = uid
      }
    })

    // 3. Chat Stats
    const chatCounts: Record<string, number> = {}
    Object.values(roomState?.chat || {}).forEach(m => {
      if (m.type !== 'system') {
        chatCounts[m.userId] = (chatCounts[m.userId] || 0) + 1
      }
    })
    Object.entries(chatCounts).forEach(([uid, count]) => {
      if (count > maxMessages) {
        maxMessages = count
        mostTalkativeId = uid
      }
    })

    return {
      mostExpensive,
      mostOverpaid,
      bestBargain,
      biggestSpender: biggestSpenderId
        ? roomState?.franchises?.[biggestSpenderId] || roomState?.participants?.[biggestSpenderId]
        : null,
      maxSpent,
      mostFrugal: mostFrugalId
        ? roomState?.franchises?.[mostFrugalId] || roomState?.participants?.[mostFrugalId]
        : null,
      minSpent,
      mostTalkative: mostTalkativeId
        ? roomState?.franchises?.[mostTalkativeId] || roomState?.participants?.[mostTalkativeId]
        : null,
      maxMessages,
    }
  }, [roomState])

  return (
    <div style={{
      background: 'rgba(7,24,44,0.6)',
      border: '1px solid #1a3a5c',
      borderRadius: 16,
      padding: '24px',
      marginBottom: 32,
    }}>
      <h3 style={{
        fontFamily: 'Teko', fontSize: 28,
        color: '#D4AF37', marginBottom: 24,
        letterSpacing: 2, display: 'flex', gap: 10,
        alignItems: 'center', borderBottom: '1px solid #1a3a5c',
        paddingBottom: 12,
      }}>
        📊 AUCTION SUPERLATIVES
      </h3>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 16,
      }}>
        {/* Most Expensive */}
        {stats.mostExpensive && (
          <StatCard
            icon="💎" title="MOST EXPENSIVE"
            value={stats.mostExpensive.name}
            sub={formatCr(stats.mostExpensive.soldFor)}
            color="#00c896"
          />
        )}
        
        {/* Biggest Spender */}
        {stats.biggestSpender && (
          <StatCard
            icon="💸" title="BIGGEST SPENDER"
            value={stats.biggestSpender.name}
            sub={`Spent ${formatCr(stats.maxSpent)}`}
            color="#ff4060"
          />
        )}

        {/* Most Overpaid */}
        {stats.mostOverpaid && (
          <StatCard
            icon="📈" title="MOST OVERPAID"
            value={stats.mostOverpaid.name}
            sub={`+${formatCr(stats.mostOverpaid.diff)} over base`}
            color="#ff8c00"
          />
        )}

        {/* Best Bargain */}
        {stats.bestBargain && (
          <StatCard
            icon="🛍️" title="BEST BARGAIN"
            value={stats.bestBargain.name}
            sub={`+${formatCr(stats.bestBargain.diff)} over base`}
            color="#4da6ff"
          />
        )}

        {/* Most Frugal */}
        {stats.mostFrugal && (
          <StatCard
            icon="🏦" title="MOST FRUGAL"
            value={stats.mostFrugal.name}
            sub={`Spent only ${formatCr(stats.minSpent)}`}
            color="#b57bee"
          />
        )}

        {/* Most Talkative */}
        {stats.mostTalkative && (
          <StatCard
            icon="🗣️" title="MOST TALKATIVE"
            value={stats.mostTalkative.name}
            sub={`${stats.maxMessages} messages`}
            color="#f093fb"
          />
        )}
      </div>

      {/* Budget Progress Bars */}
      <div style={{ marginTop: 32 }}>
        <h4 style={{
          fontFamily: 'Rajdhani', fontWeight: 700,
          color: '#5a8ab0', fontSize: 13,
          letterSpacing: 2, textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          Team Spending Overview
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(roomState?.participants || {})
            .map(([uid, p]) => {
              const spent = 100 - (p.budget || 0)
              const franchise = roomState?.franchises?.[uid]
              return { uid, spent, name: franchise?.name || p.name, color: franchise?.color || '#D4AF37', logo: franchise?.logo || '🏏' }
            })
            .sort((a,b) => b.spent - a.spent)
            .map(t => (
              <div key={t.uid}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginBottom: 6, fontSize: 13,
                  fontFamily: 'Rajdhani', fontWeight: 600,
                }}>
                  <div style={{ color: t.color }}>{t.logo} {t.name}</div>
                  <div style={{ color: '#ddeeff' }}>{formatCr(t.spent)} / 100.00 Cr</div>
                </div>
                <div style={{
                  height: 6, background: 'rgba(255,255,255,0.05)',
                  borderRadius: 4, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (t.spent / 100) * 100)}%`,
                    background: t.color,
                    borderRadius: 4,
                  }}/>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, title, value, sub, color }: any) {
  return (
    <div style={{
      background: 'rgba(3,12,24,0.6)',
      border: `1px solid ${color}40`,
      borderRadius: 12, padding: '16px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        fontSize: 32, width: 56, height: 56,
        background: `${color}15`, borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{
          color: color, fontSize: 10,
          fontFamily: 'Rajdhani', fontWeight: 700,
          letterSpacing: 2, textTransform: 'uppercase',
          marginBottom: 2,
        }}>{title}</div>
        <div style={{
          fontFamily: 'Teko', fontSize: 22,
          color: '#ddeeff', lineHeight: 1.1,
          letterSpacing: 1, marginBottom: 4,
        }}>
          {value}
        </div>
        <div style={{ color: '#5a8ab0', fontSize: 12 }}>{sub}</div>
      </div>
    </div>
  )
}

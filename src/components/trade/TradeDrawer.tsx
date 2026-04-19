"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ref, update, get, set, onValue } from 'firebase/database';
import { realtimeDb } from '@/lib/firebase';
import { toast } from 'react-hot-toast';
import { players as ALL_PLAYERS, getEspnId } from '@/data/players';
import { RoomState, TradeOffer } from '@/types/room';
import { formatCr } from '@/lib/budgetGuard';

interface TradeDrawerProps {
  roomState: RoomState | null;
  user: any;
  code: string;
}

export function TradeDrawer({ roomState, user, code }: TradeDrawerProps) {
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeTab, setTradeTab] = useState<'browse'|'offers'>('browse');
  const [isMobile, setIsMobile] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [offerModal, setOfferModal] = useState<{
    player: any,
    ownerUid: string,
    ownerName: string
  } | null>(null);

  // 1. Firebase Trade Functions
  async function sendTradeOffer(offer: any) {
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    await set(ref(realtimeDb, `rooms/${code}/trades/${tradeId}`), {
      id: tradeId,
      ...offer,
      status: 'pending',
      createdAt: Date.now(),
    });
  }

  async function acceptTrade(tradeId: string) {
    const tradeSnap = await get(ref(realtimeDb, `rooms/${code}/trades/${tradeId}`));
    const trade = tradeSnap.val();
    if (!trade || trade.status !== 'pending') return;

    const updates: Record<string, any> = {};
    const buyer = roomState?.participants?.[trade.fromUserId];
    const seller = roomState?.participants?.[trade.toUserId];
    const player = ALL_PLAYERS.find(p => p.id === trade.playerId);

    // Move player
    updates[`rooms/${code}/teams/${trade.toUserId}/${trade.playerId}`] = null;
    updates[`rooms/${code}/teams/${trade.fromUserId}/${trade.playerId}`] = {
      soldFor: trade.offerAmount,
      addedAt: Date.now(),
      isTrade: true,
    };

    // Update budgets
    updates[`rooms/${code}/participants/${trade.fromUserId}/budget`] =
      Math.round(((buyer?.budget ?? 0) - trade.offerAmount) * 100) / 100;
    updates[`rooms/${code}/participants/${trade.fromUserId}/squadSize`] =
      (buyer?.squadSize ?? 0) + 1;
    updates[`rooms/${code}/participants/${trade.toUserId}/budget`] =
      Math.round(((seller?.budget ?? 0) + trade.offerAmount) * 100) / 100;
    updates[`rooms/${code}/participants/${trade.toUserId}/squadSize`] =
      (seller?.squadSize ?? 0) - 1;

    // Overseas counts
    if (player?.nationality === 'Overseas') {
      updates[`rooms/${code}/participants/${trade.fromUserId}/overseas`] =
        (buyer?.overseas ?? 0) + 1;
      updates[`rooms/${code}/participants/${trade.toUserId}/overseas`] =
        (seller?.overseas ?? 0) - 1;
    }

    // Cancel all other pending offers for same player
    Object.entries(roomState?.trades || {}).forEach(([tid, t]: any) => {
      if (tid !== tradeId && t.playerId === trade.playerId && t.status === 'pending') {
        updates[`rooms/${code}/trades/${tid}/status`] = 'cancelled';
      }
    });

    // Mark trade accepted
    updates[`rooms/${code}/trades/${tradeId}/status`] = 'accepted';
    updates[`rooms/${code}/trades/${tradeId}/respondedAt`] = Date.now();

    await update(ref(realtimeDb), updates);
    toast.success(`Trade complete! ${trade.playerName} is now yours!`);
  }

  async function rejectTrade(tradeId: string) {
    await update(ref(realtimeDb, `rooms/${code}/trades/${tradeId}`), {
      status: 'rejected',
      respondedAt: Date.now(),
    });
    toast('Trade offer rejected', { icon:'❌' });
  }

  async function cancelTrade(tradeId: string) {
    await update(ref(realtimeDb, `rooms/${code}/trades/${tradeId}`), {
      status: 'cancelled',
      respondedAt: Date.now(),
    });
  }

  const pendingOffersCount = Object.values(roomState?.trades || {})
    .filter((t: any) => t.toUserId === user?.uid && t.status === 'pending')
    .length;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 2. Real-Time Toast Notifications for Trades
  const notifiedRef = useRef(new Set<string>());

  useEffect(() => {
    Object.values(roomState?.trades || {}).forEach((t: any) => {
      // New incoming offer
      if (t.toUserId === user?.uid &&
          t.status === 'pending' &&
          !notifiedRef.current.has(t.id)) {
        notifiedRef.current.add(t.id);
        toast(`💰 ${t.fromUserName} wants your ${t.playerName}!`, {
          duration: 8000, icon: '🔄',
          style: { border: '1px solid rgba(155,89,182,0.4)' }
        });
        setTradeTab('offers');
      }
      // Offer accepted
      if (t.fromUserId === user?.uid &&
          t.status === 'accepted' &&
          !notifiedRef.current.has(t.id + '_done')) {
        notifiedRef.current.add(t.id + '_done');
        toast.success(`🎉 ${t.toUserName} accepted! ${t.playerName} is yours!`,
          { duration: 5000 }
        );
      }
      // Offer rejected
      if (t.fromUserId === user?.uid &&
          t.status === 'rejected' &&
          !notifiedRef.current.has(t.id + '_rej')) {
        notifiedRef.current.add(t.id + '_rej');
        toast(`${t.toUserName} rejected your offer for ${t.playerName}`, {
          icon: '❌', duration: 4000,
        });
      }
    });
  }, [roomState?.trades, user?.uid]);


  return (
    <>
      {/* Floating trade button */}
      <div style={{
        position: 'fixed',
        bottom: isMobile ? 120 : 140,
        right: isMobile ? 12 : 20,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
      }}>
        <button
          onClick={() => setTradeOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: isMobile ? '10px 14px' : '12px 20px',
            borderRadius: isMobile ? 40 : 50,
            border: '1px solid rgba(155,89,182,0.5)',
            background: 'rgba(7,24,44,0.95)',
            color: '#b57bee',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700,
            fontSize: isMobile ? 13 : 15,
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px rgba(155,89,182,0.25)',
            letterSpacing: 1,
            position: 'relative',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(155,89,182,0.8)';
            e.currentTarget.style.background = 'rgba(155,89,182,0.15)';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 28px rgba(155,89,182,0.4)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(155,89,182,0.5)';
            e.currentTarget.style.background = 'rgba(7,24,44,0.95)';
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(155,89,182,0.25)';
          }}
        >
          🔄 Trade Players
          {pendingOffersCount > 0 && (
            <div style={{
              position: 'absolute',
              top: -6, right: -6,
              width: 20, height: 20,
              borderRadius: '50%',
              background: '#ff4060',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #030c18',
            }}>
              {pendingOffersCount}
            </div>
          )}
        </button>
      </div>

      {/* Trade Drawer Overlay */}
      {tradeOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setTradeOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(3px)',
              zIndex: 300,
            }}
          />

          {/* Drawer */}
          <div style={{
            position: 'fixed',
            top: 0, right: 0, bottom: 0,
            width: 'min(480px, 95vw)',
            background: '#07182c',
            borderLeft: '1px solid #1a3a5c',
            zIndex: 301,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.3s ease-out',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
          }}>

            {/* DRAWER HEADER */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #1a3a5c',
              background: 'rgba(3,12,24,0.8)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{
                  fontFamily: 'Teko, sans-serif',
                  fontSize: 26,
                  color: '#b57bee',
                  lineHeight: 1,
                  letterSpacing: 1,
                }}>
                  🔄 TRADE CENTRE
                </div>
                <div style={{
                  color: '#5a8ab0', fontSize: 11,
                  marginTop: 2, letterSpacing: 1,
                }}>
                  Browse teams · Request trades · Manage offers
                </div>
              </div>
              <button
                onClick={() => setTradeOpen(false)}
                style={{
                  width: 34, height: 34,
                  borderRadius: '50%',
                  border: '1px solid #1a3a5c',
                  background: 'transparent',
                  color: '#5a8ab0',
                  fontSize: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#ff4060';
                  e.currentTarget.style.color = '#ff4060';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#1a3a5c';
                  e.currentTarget.style.color = '#5a8ab0';
                }}
              >
                ✕
              </button>
            </div>

            {/* TABS */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid #1a3a5c',
              flexShrink: 0,
              background: 'rgba(3,12,24,0.5)',
            }}>
              {[
                { key: 'browse', label: '🔍 Browse Teams'  },
                { key: 'offers', label: `📬 My Offers${pendingOffersCount > 0 ? ` (${pendingOffersCount})` : ''}` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setTradeTab(tab.key as any)}
                  style={{
                    flex: 1,
                    padding: '12px 8px',
                    border: 'none',
                    borderBottom: `2px solid ${tradeTab === tab.key ? '#b57bee' : 'transparent'}`,
                    background: 'transparent',
                    color: tradeTab === tab.key ? '#b57bee' : '#5a8ab0',
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    letterSpacing: 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB CONTENT */}
            <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* BROWSE TAB */}
              {tradeTab === 'browse' && (
                <div style={{ padding: '16px' }}>
                  {/* Team selector */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{
                      color: '#5a8ab0', fontSize: 10,
                      letterSpacing: 3, textTransform: 'uppercase',
                      marginBottom: 8, fontFamily: 'Rajdhani',
                      fontWeight: 600,
                    }}>
                      Select a Team to Browse
                    </div>

                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}>
                      {Object.entries(roomState?.participants || {})
                        .filter(([uid]) => uid !== user?.uid)
                        .map(([uid, p]: any) => (
                          <button
                            key={uid}
                            onClick={() => setSelectedTeamId(uid)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 14px',
                              borderRadius: 50,
                              border: `1px solid ${selectedTeamId === uid
                                ? 'rgba(155,89,182,0.6)'
                                : '#1a3a5c'}`,
                              background: selectedTeamId === uid
                                ? 'rgba(155,89,182,0.15)'
                                : 'rgba(13,34,64,0.6)',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            <img
                              src={p.photoURL || ''}
                              style={{
                                width: 24, height: 24,
                                borderRadius: '50%',
                                objectFit: 'cover',
                                flexShrink: 0,
                              }}
                              onError={e => {
                                (e.target as HTMLImageElement).src =
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1a3a5c&color=b57bee&bold=true`
                              }}
                              alt={p.name}
                            />
                            <span style={{
                              fontFamily: 'Rajdhani',
                              fontWeight: 700,
                              fontSize: 13,
                              color: selectedTeamId === uid ? '#b57bee' : '#ddeeff',
                            }}>
                              {p.name}
                            </span>
                            <span style={{
                              fontSize: 10,
                              color: '#5a8ab0',
                            }}>
                              {Object.keys(roomState?.teams?.[uid] || {}).length} players
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Selected team's players */}
                  {selectedTeamId && (
                    <div>
                      <div style={{
                        color: '#5a8ab0', fontSize: 10,
                        letterSpacing: 3, textTransform: 'uppercase',
                        marginBottom: 12, fontFamily: 'Rajdhani', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{
                          flex: 1, height: 1,
                          background: 'linear-gradient(90deg, rgba(155,89,182,0.3), transparent)',
                          display: 'inline-block',
                        }}/>
                        {roomState?.participants?.[selectedTeamId]?.name}'s Squad
                        <span style={{
                          flex: 1, height: 1,
                          background: 'linear-gradient(270deg, rgba(155,89,182,0.3), transparent)',
                          display: 'inline-block',
                        }}/>
                      </div>

                      {/* Group by role */}
                      {['Batsman','WK-Batsman','All-Rounder','Bowler'].map(role => {
                        const teamPlayers = Object.entries(
                          roomState?.teams?.[selectedTeamId] || {}
                        )
                        .map(([id, meta]: any) => {
                          const pl = ALL_PLAYERS.find(p => p.id === id);
                          return pl ? { ...pl, soldFor: meta?.soldFor ?? pl.basePrice } : null;
                        })
                        .filter(p => p && p.role === role) as any[];

                        if (!teamPlayers.length) return null;

                        const roleColors: any = {
                          'Batsman':     '#00c896',
                          'WK-Batsman':  '#ff8c00',
                          'All-Rounder': '#b57bee',
                          'Bowler':      '#ff4060',
                        };

                        return (
                          <div key={role} style={{ marginBottom: 16 }}>
                            <div style={{
                              color: roleColors[role],
                              fontSize: 10, letterSpacing: 2,
                              textTransform: 'uppercase',
                              fontFamily: 'Rajdhani', fontWeight: 700,
                              marginBottom: 8,
                            }}>
                              {role}s ({teamPlayers.length})
                            </div>

                            {teamPlayers.map((player: any) => {
                              // Check if I already have a pending offer for this player
                              const alreadyOffered = Object.values(
                                roomState?.trades || {}
                              ).some((t: any) =>
                                t.fromUserId === user?.uid &&
                                t.playerId === player.id &&
                                t.status === 'pending'
                              );

                              return (
                                <div
                                  key={player.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    marginBottom: 6,
                                    background: 'rgba(13,34,64,0.6)',
                                    border: '1px solid #1a3a5c',
                                    transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'rgba(155,89,182,0.3)';
                                    e.currentTarget.style.background = 'rgba(13,34,64,0.9)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = '#1a3a5c';
                                    e.currentTarget.style.background = 'rgba(13,34,64,0.6)';
                                  }}
                                >
                                  {/* Player photo */}
                                  <img
                                    src={getEspnId(player.id)
                                      ? `https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${getEspnId(player.id)}.png`
                                      : `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=1a3a5c&color=D4AF37&bold=true`
                                    }
                                    style={{
                                      width: 36, height: 36,
                                      borderRadius: '50%',
                                      objectFit: 'cover', flexShrink: 0,
                                    }}
                                    onError={e => {
                                      (e.target as HTMLImageElement).src =
                                        `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=1a3a5c&color=D4AF37&bold=true`;
                                    }}
                                    alt={player.name}
                                  />

                                  {/* Info */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                      fontFamily: 'Rajdhani',
                                      fontWeight: 700, fontSize: 14,
                                      color: '#ffffff',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {player.name}
                                    </div>
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6, marginTop: 2,
                                    }}>
                                      <span style={{
                                        fontSize: 9, padding: '1px 7px',
                                        borderRadius: 20,
                                        background: `${roleColors[role]}18`,
                                        color: roleColors[role],
                                        fontFamily: 'Rajdhani', fontWeight: 700,
                                        letterSpacing: 1,
                                      }}>
                                        {player.role === 'WK-Batsman' ? 'WK' :
                                         player.role === 'All-Rounder' ? 'AR' :
                                         player.role === 'Batsman' ? 'BAT' : 'BOWL'}
                                      </span>
                                      <span style={{ fontSize: 11 }}>
                                        {player.nationality === 'Indian' ? '🇮🇳' : '🌏'}
                                      </span>
                                      <span style={{
                                        fontFamily: 'Teko',
                                        fontSize: 13, color: '#D4AF37',
                                      }}>
                                        {formatCr(player.soldFor)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Request Trade button */}
                                  <button
                                    onClick={() => {
                                      if (alreadyOffered) return;
                                      setOfferModal({
                                        player,
                                        ownerUid: selectedTeamId,
                                        ownerName: roomState?.participants?.[selectedTeamId]?.name || '',
                                      });
                                    }}
                                    disabled={alreadyOffered}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: 8,
                                      border: `1px solid ${alreadyOffered
                                        ? 'rgba(255,255,255,0.08)'
                                        : 'rgba(155,89,182,0.4)'}`,
                                      background: alreadyOffered
                                        ? 'rgba(255,255,255,0.04)'
                                        : 'rgba(155,89,182,0.12)',
                                      color: alreadyOffered ? '#5a8ab0' : '#b57bee',
                                      fontFamily: 'Rajdhani',
                                      fontWeight: 700,
                                      fontSize: 11,
                                      cursor: alreadyOffered ? 'not-allowed' : 'pointer',
                                      letterSpacing: 1,
                                      flexShrink: 0,
                                      transition: 'all 0.15s',
                                      whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={e => {
                                      if (!alreadyOffered) {
                                        e.currentTarget.style.background = 'rgba(155,89,182,0.25)';
                                        e.currentTarget.style.borderColor = 'rgba(155,89,182,0.7)';
                                      }
                                    }}
                                    onMouseLeave={e => {
                                      if (!alreadyOffered) {
                                        e.currentTarget.style.background = 'rgba(155,89,182,0.12)';
                                        e.currentTarget.style.borderColor = 'rgba(155,89,182,0.4)';
                                      }
                                    }}
                                  >
                                    {alreadyOffered ? '✓ Offered' : '🔄 Request Trade'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Empty state */}
                  {!selectedTeamId && (
                    <div style={{
                      textAlign: 'center',
                      padding: '48px 20px',
                      color: '#5a8ab0',
                    }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>👆</div>
                      <div style={{
                        fontFamily: 'Teko', fontSize: 22, color: '#b57bee',
                        marginBottom: 6,
                      }}>
                        Select a Team Above
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                        Choose a team to browse their squad<br/>
                        and request trades for players you want
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* OFFERS TAB */}
              {tradeTab === 'offers' && (
                <div style={{ padding: '16px' }}>
                  <OffersTab
                    roomState={roomState}
                    user={user}
                    code={code}
                    formatCr={formatCr}
                    onAccept={acceptTrade}
                    onReject={rejectTrade}
                    onCancel={cancelTrade}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Offer Modal */}
      {offerModal && (
        <div style={{
          position: 'fixed', inset: 0,
          zIndex: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(6px)',
          padding: 20,
        }}
        onClick={() => setOfferModal(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#07182c',
              border: '1px solid rgba(155,89,182,0.4)',
              borderRadius: 20,
              padding: '28px',
              maxWidth: 400,
              width: '100%',
              animation: 'fadeInUp 0.25s ease-out',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            {/* Modal header */}
            <div style={{
              fontFamily: 'Teko', fontSize: 28,
              color: '#b57bee', letterSpacing: 1,
              lineHeight: 1, marginBottom: 4,
            }}>
              🔄 Request Trade
            </div>
            <div style={{
              color: '#5a8ab0', fontSize: 12,
              marginBottom: 20,
            }}>
              Send a trade offer to {offerModal.ownerName}
            </div>

            {/* Player being requested */}
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: 12, padding: '14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #1a3a5c',
              borderRadius: 12, marginBottom: 20,
            }}>
              <img
                src={getEspnId(offerModal.player.id)
                  ? `https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${getEspnId(offerModal.player.id)}.png`
                  : `https://ui-avatars.com/api/?name=${encodeURIComponent(offerModal.player.name)}&background=1a3a5c&color=D4AF37&bold=true`
                }
                style={{
                  width: 52, height: 52,
                  borderRadius: '50%', objectFit: 'cover',
                  border: '2px solid #D4AF37',
                }}
                onError={e => {
                  (e.target as HTMLImageElement).src =
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(offerModal.player.name)}&background=1a3a5c&color=D4AF37&bold=true`;
                }}
                alt={offerModal.player.name}
              />
              <div>
                <div style={{
                  fontFamily: 'Rajdhani', fontWeight: 800,
                  fontSize: 18, color: '#fff',
                }}>
                  {offerModal.player.name}
                </div>
                <div style={{ color:'#5a8ab0', fontSize:12 }}>
                  {offerModal.player.nationality === 'Overseas' ? '🌏' : '🇮🇳'}{' '}
                  {offerModal.player.role} ·{' '}
                  Paid: {formatCr(offerModal.player.soldFor)}
                </div>
              </div>
            </div>

            {/* Offer amount input */}
            <OfferAmountInput
              player={offerModal.player}
              myBudget={roomState?.participants?.[user?.uid]?.budget ?? 100}
              formatCr={formatCr}
              onSubmit={async (amount: number) => {
                await sendTradeOffer({
                  fromUserId: user.uid,
                  fromUserName: user.displayName || '',
                  fromUserPhoto: user.photoURL || '',
                  toUserId: offerModal.ownerUid,
                  toUserName: offerModal.ownerName,
                  playerId: offerModal.player.id,
                  playerName: offerModal.player.name,
                  offerAmount: amount,
                });
                setOfferModal(null);
                setTradeTab('offers');
                toast.success(`Trade offer sent for ${offerModal.player.name}!`);
              }}
              onCancel={() => setOfferModal(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}

function OffersTab({ roomState, user, code, formatCr, onAccept, onReject, onCancel }: any) {
  const trades = Object.values(roomState?.trades || {}) as any[];
  
  const incoming = trades.filter(t =>
    t.toUserId === user?.uid && t.status === 'pending'
  );
  const outgoing = trades.filter(t =>
    t.fromUserId === user?.uid && t.status === 'pending'
  );
  const history = trades.filter(t =>
    (t.fromUserId === user?.uid || t.toUserId === user?.uid) &&
    t.status !== 'pending'
  ).sort((a, b) => (b.respondedAt || 0) - (a.respondedAt || 0));

  if (trades.length === 0) return (
    <div style={{
      textAlign: 'center', padding: '48px 20px', color: '#5a8ab0',
    }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📬</div>
      <div style={{ fontFamily: 'Teko', fontSize: 22, color: '#b57bee' }}>
        No Trade Offers Yet
      </div>
      <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
        Browse teams to request trades,<br/>
        or wait for offers to arrive!
      </div>
    </div>
  );

  return (
    <div>
      {/* Incoming offers */}
      {incoming.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: 'Rajdhani', fontWeight: 700,
            fontSize: 11, letterSpacing: 3,
            color: '#ff8c00', textTransform: 'uppercase',
            marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            📥 Incoming ({incoming.length})
          </div>

          {incoming.map((trade: any) => {
            const player = ALL_PLAYERS.find(p => p.id === trade.playerId);
            const myBudgetAfter = (roomState?.participants?.[trade.toUserId]?.budget ?? 0)
              + trade.offerAmount;

            return (
              <div key={trade.id} style={{
                padding: '14px',
                borderRadius: 12,
                background: 'rgba(255,140,0,0.06)',
                border: '1px solid rgba(255,140,0,0.25)',
                marginBottom: 10,
              }}>
                {/* Who wants what */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  gap: 10, marginBottom: 12,
                }}>
                  <img
                    src={trade.fromUserPhoto || ''}
                    style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}
                    onError={e => {
                      (e.target as HTMLImageElement).src =
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(trade.fromUserName)}&background=1a3a5c&color=D4AF37&bold=true`;
                    }}
                    alt={trade.fromUserName}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: 'Rajdhani', fontWeight: 700,
                      fontSize: 14, color: '#ddeeff',
                    }}>
                      {trade.fromUserName}
                    </div>
                    <div style={{ color:'#5a8ab0', fontSize:11 }}>
                      wants your player
                    </div>
                  </div>
                </div>

                {/* Player being requested */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  gap: 10, padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8, marginBottom: 12,
                }}>
                  {player && (
                    <img
                      src={getEspnId(player.id)
                        ? `https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${getEspnId(player.id)}.png`
                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=1a3a5c&color=D4AF37&bold=true`
                      }
                      style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover' }}
                      onError={e => {
                        (e.target as HTMLImageElement).src =
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(trade.playerName)}&background=1a3a5c&color=D4AF37&bold=true`;
                      }}
                      alt={trade.playerName}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: 'Rajdhani', fontWeight: 700,
                      fontSize: 15, color: '#fff',
                    }}>
                      {trade.playerName}
                    </div>
                    <div style={{ color:'#5a8ab0', fontSize:11 }}>
                      {player?.nationality === 'Overseas' ? '🌏 Overseas' : '🇮🇳 Indian'}
                      {' · '}{player?.role}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{
                      fontFamily:'Teko', fontSize:22, color:'#D4AF37', lineHeight:1,
                    }}>
                      {formatCr(trade.offerAmount)}
                    </div>
                    <div style={{ color:'#5a8ab0', fontSize:10 }}>offered</div>
                  </div>
                </div>

                {/* Budget impact */}
                <div style={{
                  display: 'flex', gap: 6,
                  padding: '8px 12px',
                  background: 'rgba(0,200,150,0.06)',
                  borderRadius: 8,
                  marginBottom: 12,
                  fontSize: 12, color: '#5a8ab0',
                  alignItems: 'center',
                }}>
                  <span>💰</span>
                  <span>Your budget after accepting:</span>
                  <span style={{ color:'#00c896', fontFamily:'Teko', fontSize:16, marginLeft:'auto' }}>
                    {formatCr(myBudgetAfter)}
                  </span>
                </div>

                {/* Accept / Reject buttons */}
                <div style={{ display:'flex', gap:8 }}>
                  <button
                    onClick={() => onAccept(trade.id)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 8,
                      border: '1px solid rgba(0,200,150,0.4)',
                      background: 'rgba(0,200,150,0.12)',
                      color: '#00c896',
                      fontFamily: 'Rajdhani',
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: 'pointer',
                      letterSpacing: 1,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(0,200,150,0.22)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(0,200,150,0.12)'}
                  >
                    ✅ Accept Trade
                  </button>
                  <button
                    onClick={() => onReject(trade.id)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,64,96,0.3)',
                      background: 'rgba(255,64,96,0.08)',
                      color: '#ff4060',
                      fontFamily: 'Rajdhani',
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: 'pointer',
                      letterSpacing: 1,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,64,96,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(255,64,96,0.08)'}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Outgoing offers */}
      {outgoing.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: 'Rajdhani', fontWeight: 700,
            fontSize: 11, letterSpacing: 3,
            color: '#4da6ff', textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            📤 Sent ({outgoing.length})
          </div>

          {outgoing.map((trade: any) => {
            const player = ALL_PLAYERS.find(p => p.id === trade.playerId);
            return (
              <div key={trade.id} style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(77,166,255,0.05)',
                border: '1px solid rgba(77,166,255,0.2)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                {player && (
                  <img
                    src={getEspnId(player.id)
                      ? `https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${getEspnId(player.id)}.png`
                      : `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=1a3a5c&color=D4AF37&bold=true`
                    }
                    style={{ width:36,height:36,borderRadius:'50%',objectFit:'cover',flexShrink:0 }}
                    onError={e => {
                      (e.target as HTMLImageElement).src =
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(trade.playerName)}&background=1a3a5c&color=D4AF37&bold=true`;
                    }}
                    alt={trade.playerName}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'Rajdhani', fontWeight: 700,
                    fontSize: 14, color: '#fff',
                  }}>
                    {trade.playerName}
                  </div>
                  <div style={{ color:'#5a8ab0', fontSize:11 }}>
                    To: {trade.toUserName} · {formatCr(trade.offerAmount)}
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  gap: 6, flexShrink: 0,
                }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20,
                    background: 'rgba(255,140,0,0.1)',
                    color: '#ff8c00',
                    fontSize: 11, fontWeight: 700,
                    letterSpacing: 1,
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}>
                    ⏳ PENDING
                  </span>
                  <button
                    onClick={() => onCancel(trade.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,64,96,0.25)',
                      background: 'transparent',
                      color: '#ff4060',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'Rajdhani',
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trade history */}
      {history.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'Rajdhani', fontWeight: 700,
            fontSize: 11, letterSpacing: 3,
            color: '#5a8ab0', textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            📋 History
          </div>

          {history.map((trade: any) => (
            <div key={trade.id} style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>
                {trade.status === 'accepted' ? '✅' :
                 trade.status === 'rejected' ? '❌' : '🚫'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'Rajdhani', fontWeight: 600,
                  fontSize: 13, color: '#ddeeff',
                }}>
                  {trade.playerName}
                </div>
                <div style={{ color:'#5a8ab0', fontSize:11 }}>
                  {trade.fromUserId === user?.uid
                    ? `You offered ${formatCr(trade.offerAmount)} to ${trade.toUserName}`
                    : `${trade.fromUserName} offered ${formatCr(trade.offerAmount)}`
                  }
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: trade.status === 'accepted' ? '#00c896' :
                       trade.status === 'rejected' ? '#ff4060' : '#5a8ab0',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}>
                {trade.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferAmountInput({ player, myBudget, formatCr, onSubmit, onCancel }: any) {
  const [amount, setAmount] = useState(player.soldFor);
  const [sending, setSending] = useState(false);
  
  const quickAmounts = [
    player.soldFor,
    Math.round((player.soldFor + 2) * 100) / 100,
    Math.round((player.soldFor + 5) * 100) / 100,
    Math.round((player.soldFor + 10) * 100) / 100,
  ].filter(a => a <= myBudget);

  const isValid = amount > 0 && amount <= myBudget;

  return (
    <div>
      <div style={{
        color: '#5a8ab0', fontSize: 10,
        letterSpacing: 3, textTransform: 'uppercase',
        marginBottom: 8, fontFamily: 'Rajdhani', fontWeight: 600,
      }}>
        Your Offer (₹ Crore)
      </div>

      {/* Amount input */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'rgba(3,49,94,0.4)',
        border: `1px solid ${isValid ? 'rgba(155,89,182,0.5)' : '#1a3a5c'}`,
        borderRadius: 10, padding: '4px 4px 4px 16px',
        marginBottom: 12,
        transition: 'border-color 0.15s',
      }}>
        <span style={{
          fontFamily: 'Teko', fontSize: 22,
          color: '#5a8ab0', marginRight: 4,
        }}>₹</span>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(parseFloat(e.target.value) || 0)}
          min={0.20}
          max={myBudget}
          step={0.05}
          style={{
            flex: 1, background: 'transparent',
            border: 'none', outline: 'none',
            fontFamily: 'Teko', fontSize: 28,
            color: '#D4AF37', width: '100%',
          }}
        />
        <span style={{
          fontFamily: 'Rajdhani', fontWeight: 600,
          fontSize: 13, color: '#5a8ab0',
          padding: '8px 12px',
        }}>
          Cr
        </span>
      </div>

      {/* Quick amount buttons */}
      <div style={{
        display: 'flex', gap: 6,
        flexWrap: 'wrap', marginBottom: 16,
      }}>
        {quickAmounts.map((qa, i) => (
          <button
            key={i}
            onClick={() => setAmount(qa)}
            style={{
              padding: '5px 12px', borderRadius: 20,
              border: `1px solid ${amount === qa
                ? 'rgba(155,89,182,0.6)' : 'rgba(255,255,255,0.08)'}`,
              background: amount === qa
                ? 'rgba(155,89,182,0.15)' : 'rgba(255,255,255,0.04)',
              color: amount === qa ? '#b57bee' : '#5a8ab0',
              fontFamily: 'Teko', fontSize: 16,
              cursor: 'pointer', transition: 'all 0.1s',
            }}
          >
            {formatCr(qa)}
          </button>
        ))}
      </div>

      {/* Budget check */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 12, color: '#5a8ab0',
        padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 16,
      }}>
        <span>Your budget: {formatCr(myBudget)}</span>
        <span style={{ color: amount > myBudget ? '#ff4060' : '#00c896' }}>
          After trade: {formatCr(Math.round((myBudget - amount) * 100) / 100)}
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', gap:10 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '12px',
            borderRadius: 10,
            border: '1px solid #1a3a5c',
            background: 'transparent',
            color: '#5a8ab0',
            fontFamily: 'Rajdhani', fontWeight: 600,
            fontSize: 14, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            if (!isValid) return;
            setSending(true);
            await onSubmit(amount);
            setSending(false);
          }}
          disabled={!isValid || sending}
          style={{
            flex: 2, padding: '12px',
            borderRadius: 10, border: 'none',
            background: isValid
              ? 'linear-gradient(135deg, #9b59b6, #b57bee)'
              : '#1a3a5c',
            color: isValid ? '#fff' : '#5a8ab0',
            fontFamily: 'Rajdhani', fontWeight: 700,
            fontSize: 16, cursor: isValid ? 'pointer' : 'not-allowed',
            letterSpacing: 1,
            boxShadow: isValid ? '0 4px 16px rgba(155,89,182,0.4)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {sending ? '⏳ Sending...' : '🔄 Send Trade Offer'}
        </button>
      </div>
    </div>
  );
}

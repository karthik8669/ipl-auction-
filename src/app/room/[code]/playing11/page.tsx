"use client";

import { use, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ref, onValue } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { players as ALL_PLAYERS, getEspnId } from "@/data/players";
import { toArray } from "@/lib/utils";

export function formatCr(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return "—";
  if (value < 1) return (value * 100).toFixed(0) + " L";
  return value.toFixed(2) + " Cr";
}

export default function Playing11Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = String(rawCode || "").trim().toUpperCase();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [roomState, setRoomState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Playing 11 Selection State
  const [selectedXI, setSelectedXI] = useState<string[]>([]);
  const [captain, setCaptain] = useState<string | null>(null);
  const [viceCaptain, setViceCaptain] = useState<string | null>(null);
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  useEffect(() => {
    if (authLoading || !user || !code) return;
    const roomRef = ref(realtimeDb, `rooms/${code}`);
    const unsub = onValue(roomRef, (snap) => {
      setRoomState(snap.val());
      setLoading(false);
    });
    return () => unsub();
  }, [code, user, authLoading]);

  // Extract my squad
  const mySquad = useMemo(() => {
    if (!roomState || !user) return [];
    const myTeamMap = roomState.teams?.[user.uid] || {};
    return Object.keys(myTeamMap)
      .map((id) => ALL_PLAYERS.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .sort((a, b) => b.basePrice - a.basePrice);
  }, [roomState, user]);

  // Validation
  const hasWk = selectedXI.some((id) => {
    const p = mySquad.find(x => x.id === id);
    return p?.role === "WK-Batsman";
  });
  
  const isValidXI = selectedXI.length === 11 && hasWk && captain && viceCaptain && captain !== viceCaptain;

  const togglePlayer = (id: string) => {
    setSelectedXI((prev) => {
      if (prev.includes(id)) {
        if (captain === id) setCaptain(null);
        if (viceCaptain === id) setViceCaptain(null);
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 11) return prev;
      return [...prev, id];
    });
  };

  const handleAnalyze = async () => {
    if (!isValidXI) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);

    const xiPlayers = selectedXI.map(id => mySquad.find(p => p.id === id));
    
    try {
      const res = await fetch('/api/analyze-playing11', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          players: xiPlayers,
          captain: mySquad.find(p => p.id === captain)?.name,
          viceCaptain: mySquad.find(p => p.id === viceCaptain)?.name
        })
      });

      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.analysis);
      } else {
        alert("Analysis failed. Try again.");
      }
    } catch (e) {
      console.error(e);
      alert("Error reaching AI API");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading || authLoading) return <div style={{background:'#030c18', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#D4AF37'}}>Loading...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#030c18", padding: "20px" }}>
      
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "Teko", fontSize: 36, color: "#D4AF37", margin: 0 }}>PLAYING 11</h1>
          <div style={{ color: "#5a8ab0", fontSize: 13 }}>Select your best 11 and get AI feedback</div>
        </div>
        <button onClick={() => router.push(`/room/${code}/results`)} style={{ padding: "8px 16px", borderRadius: 8, background: "transparent", border: "1px solid #1a3a5c", color: "#5a8ab0", cursor: "pointer" }}>
          ← Back to Results
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        
        {/* Left: Squad Selection */}
        <div style={{ background: '#07182c', borderRadius: 16, padding: 20, border: '1px solid #1a3a5c' }}>
          <h2 style={{ color: '#ddeeff', marginTop: 0, marginBottom: 16, fontSize: 18 }}>Your Squad ({mySquad.length})</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {mySquad.map(p => {
              const isSelected = selectedXI.includes(p.id);
              return (
                <div key={p.id} onClick={() => togglePlayer(p.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, cursor: 'pointer',
                  background: isSelected ? 'rgba(0, 200, 150, 0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? '#00c896' : '#1a3a5c'}`
                }}>
                  <img src={`https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_160,q_auto:low/lsci/db/PICTURES/CMS/316500/${getEspnId(p.id)}.png`} 
                       alt={p.name} style={{width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', background: '#111'}} 
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: isSelected ? '#00c896' : '#ddeeff', fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#5a8ab0' }}>{p.role} · {p.nationality === 'Overseas' ? 'OS' : 'IND'}</div>
                  </div>
                  {isSelected && (
                    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
                      <button 
                        onClick={() => setCaptain(p.id)}
                        style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: captain === p.id ? '#D4AF37' : '#1a3a5c', color: captain === p.id ? '#000' : '#fff', fontSize: 11, cursor: 'pointer' }}>
                        C
                      </button>
                      <button 
                        onClick={() => setViceCaptain(p.id)}
                        style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: viceCaptain === p.id ? '#aaa' : '#1a3a5c', color: viceCaptain === p.id ? '#000' : '#fff', fontSize: 11, cursor: 'pointer' }}>
                        VC
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Analysis Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Status Box */}
          <div style={{ background: '#07182c', borderRadius: 16, padding: 20, border: '1px solid #1a3a5c' }}>
            <div style={{ color: selectedXI.length === 11 ? '#00c896' : '#ff4060', marginBottom: 8 }}>
              {selectedXI.length}/11 Players Selected
            </div>
            <div style={{ color: hasWk ? '#00c896' : '#ff4060', marginBottom: 8, fontSize: 13 }}>
              {hasWk ? '✓ Wicket Keeper Included' : '✗ Need at least 1 WK'}
            </div>
            <div style={{ color: captain ? '#00c896' : '#ff4060', marginBottom: 8, fontSize: 13 }}>
              {captain ? '✓ Captain Selected' : '✗ Select Captain (C)'}
            </div>
            <div style={{ color: viceCaptain ? '#00c896' : '#ff4060', marginBottom: 16, fontSize: 13 }}>
              {viceCaptain ? '✓ Vice Captain Selected' : '✗ Select Vice Captain (VC)'}
            </div>

            <button 
              onClick={handleAnalyze}
              disabled={!isValidXI || isAnalyzing}
              style={{
                width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                background: isValidXI ? 'linear-gradient(135deg, #D4AF37, #f5d76e)' : '#1a3a5c',
                color: isValidXI ? '#000' : '#5a8ab0', fontWeight: 'bold', cursor: isValidXI ? 'pointer' : 'not-allowed'
              }}>
              {isAnalyzing ? 'Analyzing...' : '🤖 Analyze Playing 11'}
            </button>
          </div>

          {/* AI Result */}
          {analysisResult && (
            <div style={{ background: 'rgba(212,175,55,0.05)', borderRadius: 16, padding: 20, border: '1px solid rgba(212,175,55,0.2)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📊 AI Verdict</div>
              
              <div style={{ color: '#D4AF37', fontSize: 18, fontFamily: 'Teko', marginBottom: 4 }}>RATING: {analysisResult.rating}/10</div>
              
              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: '#00c896', fontSize: 13 }}>STRENGTHS</strong>
                <p style={{ color: '#ddeeff', fontSize: 13, margin: '4px 0 0' }}>{analysisResult.strengths}</p>
              </div>

              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: '#ff4060', fontSize: 13 }}>WEAKNESSES</strong>
                <p style={{ color: '#ddeeff', fontSize: 13, margin: '4px 0 0' }}>{analysisResult.weaknesses}</p>
              </div>

              <div>
                <strong style={{ color: '#5a8ab0', fontSize: 13 }}>FINAL VERDICT</strong>
                <p style={{ color: '#ddeeff', fontSize: 13, margin: '4px 0 0', fontStyle: 'italic' }}>"{analysisResult.summary}"</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

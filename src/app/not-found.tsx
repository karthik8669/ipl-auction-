export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#030c18',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏏</div>
        <div style={{
          fontFamily: 'Teko, sans-serif',
          fontSize: 72,
          color: '#D4AF37',
          letterSpacing: 4,
          lineHeight: 1,
          marginBottom: 8,
        }}>
          404
        </div>
        <div style={{
          color: '#5a8ab0',
          fontSize: 16,
          marginBottom: 24,
        }}>
          Page not found
        </div>
        <a href="/" style={{
          display: 'inline-block',
          padding: '12px 32px',
          borderRadius: 10,
          backgroundImage: 'linear-gradient(135deg, #D4AF37, #f5d76e)',
          color: '#111',
          fontFamily: 'Rajdhani, sans-serif',
          fontWeight: 700,
          fontSize: 16,
          textDecoration: 'none',
          letterSpacing: 1,
        }}>
          🏠 Go Home
        </a>
      </div>
    </div>
  )
}

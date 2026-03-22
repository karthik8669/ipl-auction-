import { ClientProviders } from '@/components/shared/ClientProviders'

export const metadata = {
  title: 'IPL Auction 2026',
  description: 'Real-time multiplayer IPL auction game',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Rajdhani:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{
        margin: 0,
        padding: 0,
        background: '#030c18',
        color: '#ddeeff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        minHeight: '100vh',
      }}>
        {children}
        <ClientProviders />
      </body>
    </html>
  )
}
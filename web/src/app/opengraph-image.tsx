import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'CodeMore — the static analyzer your AI agent reads';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          background:
            'radial-gradient(80% 60% at 75% 30%, rgba(12,142,233,0.32), transparent 70%),' +
            'radial-gradient(60% 50% at 15% 80%, rgba(99,102,241,0.28), transparent 70%),' +
            'linear-gradient(160deg, #020617 0%, #06112a 60%, #051434 100%)',
          padding: 80,
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: 26,
              background: 'linear-gradient(180deg, #36aaf8 0%, #0c8ee9 100%)',
              boxShadow: '0 18px 60px -10px rgba(12,142,233,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <svg width="74" height="74" viewBox="0 0 48 48" fill="none">
              <path d="M11 11 L29 29" stroke="white" strokeWidth="3.4" strokeLinecap="round"/>
              <path d="M16 33 L20 37 L37 20" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.95"/>
              <circle cx="37" cy="11" r="4.2" fill="white"/>
            </svg>
          </div>
          <div style={{ fontSize: 78, fontWeight: 800, color: '#f1f5f9', letterSpacing: -2.5, lineHeight: 1 }}>
            Code<span style={{ color: '#36aaf8' }}>More</span>
          </div>
        </div>

        <div style={{
          marginTop: 64,
          fontSize: 60,
          fontWeight: 700,
          color: '#f1f5f9',
          lineHeight: 1.06,
          letterSpacing: -2,
          maxWidth: 1020,
        }}>
          The static analyzer your <span style={{ color: '#36aaf8' }}>AI agent</span> reads.
        </div>

        <div style={{
          marginTop: 28,
          fontSize: 26,
          color: '#94a3b8',
          maxWidth: 920,
          lineHeight: 1.45,
        }}>
          64 rules + 8 external adapters. Catches the bugs that ship in vibe-coded apps. Reports them
          in a schema your coding agent can act on.
        </div>

        <div style={{
          marginTop: 'auto',
          display: 'flex',
          gap: 24,
          alignItems: 'center',
          fontSize: 22,
          color: '#cbd5e1',
          fontFamily: 'monospace',
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(163,230,53,0.08)',
            border: '1px solid rgba(163,230,53,0.35)',
            color: '#a3e635',
            fontSize: 18,
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: '#a3e635',
              display: 'inline-block',
            }}/>
            v0.2.0
          </span>
          <span>CLI</span><span>·</span>
          <span>MCP</span><span>·</span>
          <span>VS Code</span><span>·</span>
          <span>GitHub Action</span>
        </div>
      </div>
    ),
    { ...size }
  );
}

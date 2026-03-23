import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'origin': 'http://localhost:3000',
      'host': 'localhost:3000',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Input validation', () => {
  it('rejects project name over 100 chars with 400', async () => {
    const { POST } = await import('../app/api/projects/route');
    const req = makeRequest('POST', 'http://localhost:3000/api/projects', {
      name: 'a'.repeat(101), source: 'upload',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects empty project name with 400', async () => {
    const { POST } = await import('../app/api/projects/route');
    const req = makeRequest('POST', 'http://localhost:3000/api/projects', {
      name: '', source: 'upload',
    });
    expect((await POST(req)).status).toBe(400);
  });

  it('rejects SQL injection characters with 400', async () => {
    const { POST } = await import('../app/api/projects/route');
    const req = makeRequest('POST', 'http://localhost:3000/api/projects', {
      name: "'; DROP TABLE projects; --", source: 'upload',
    });
    expect((await POST(req)).status).toBe(400);
  });
});

describe('CSRF protection', () => {
  it('rejects POST from different origin with 403', async () => {
    const { POST } = await import('../app/api/projects/route');
    const req = makeRequest(
      'POST', 'http://localhost:3000/api/projects',
      { name: 'test', source: 'upload' },
      { origin: 'https://evil.com', host: 'localhost:3000' }
    );
    expect((await POST(req)).status).toBe(403);
  });

  it('rejects DELETE from different origin with 403', async () => {
    const { DELETE } = await import('../app/api/projects/[id]/route');
    const req = makeRequest(
      'DELETE', 'http://localhost:3000/api/projects/test-id',
      undefined,
      { origin: 'https://evil.com', host: 'localhost:3000' }
    );
    const res = await DELETE(req, { params: { id: 'test-id' } });
    expect(res.status).toBe(403);
  });
});

describe('Authentication', () => {
  it('returns 401 for unauthenticated requests', async () => {
    vi.mock('next-auth', () => ({
      getServerSession: vi.fn().mockResolvedValue(null),
    }));
    const { GET } = await import('../app/api/projects/route');
    const req = makeRequest('GET', 'http://localhost:3000/api/projects');
    expect((await GET(req)).status).toBe(401);
  });
});

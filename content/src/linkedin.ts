import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI!;
const TOKEN_FILE = path.join(process.cwd(), 'content/.linkedin-token.json');

interface TokenData {
  access_token: string;
  expires_at: number;
  person_id?: string;
}

function loadToken(): TokenData | null {
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    if (data.expires_at && Date.now() > data.expires_at) {
      console.log('LinkedIn token expired');
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveToken(data: TokenData) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

export function getAuthUrl(): string {
  const scopes = 'openid profile email w_member_social';
  return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}`;
}

export async function exchangeCode(code: string): Promise<TokenData> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  const data = await res.json() as any;
  if (data.error) throw new Error(`LinkedIn OAuth error: ${data.error_description || data.error}`);

  const tokenData: TokenData = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000),
  };

  // Get person ID
  const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const me = await meRes.json() as any;
  tokenData.person_id = me.sub;

  saveToken(tokenData);
  console.log(`LinkedIn authenticated as: ${me.name} (${me.email})`);
  return tokenData;
}

export async function postToLinkedIn(text: string): Promise<{ success: boolean; id?: string }> {
  const token = loadToken();
  if (!token) throw new Error('Not authenticated. Run: pnpm content:linkedin-auth');

  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': '202402',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${token.person_id}`,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
    }),
  });

  if (res.status === 201) {
    const postId = res.headers.get('x-restli-id') || 'unknown';
    console.log(`LinkedIn post published! ID: ${postId}`);
    return { success: true, id: postId };
  }

  const error = await res.text();
  throw new Error(`LinkedIn post failed (${res.status}): ${error}`);
}

export function isAuthenticated(): boolean {
  return loadToken() !== null;
}

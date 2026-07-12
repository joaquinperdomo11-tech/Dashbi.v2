const ML_CLIENT_ID     = process.env.ML_CLIENT_ID!;
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET!;
const APP_URL          = process.env.NEXT_PUBLIC_APP_URL!;

export const ML_REDIRECT_URI = `${APP_URL}/api/ml/callback`;

export function getMLAuthUrl(tenantId: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id:     ML_CLIENT_ID,
    redirect_uri:  ML_REDIRECT_URI,
    state:         tenantId,
  });
  return `https://auth.mercadolibre.com.uy/authorization?${params}`;
}

export async function exchangeMLCode(code: string) {
  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code,
      redirect_uri:  ML_REDIRECT_URI,
    }),
  });
  return res.json();
}

export async function refreshMLToken(refreshToken: string) {
  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  return res.json();
}

export async function getMLUser(accessToken: string) {
  const res = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

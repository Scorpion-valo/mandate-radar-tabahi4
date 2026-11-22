/**
 * Mandate Radar Authenticated Fetch Utility
 * Automatically attaches Authorization: Bearer <token> from localStorage.
 * On 401 Unauthorized, clears credentials and signals session expiration.
 */

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('mandate_radar_token')

  const headers = new Headers(init.headers || {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(input, {
    ...init,
    headers
  })

  if (res.status === 401) {
    // Clear stored credentials on unauthorized response
    localStorage.removeItem('mandate_radar_token')
    localStorage.removeItem('mandate_radar_user')
    window.dispatchEvent(new CustomEvent('mandate_radar_auth_expired'))
  }

  return res
}

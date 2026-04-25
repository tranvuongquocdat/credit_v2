// Build email cho Supabase auth dựa theo deploy env.
// Dùng env public NEXT_PUBLIC_BUILD_NAME để cách ly user namespace giữa v1 và v2.
// v2 (NEXT_PUBLIC_BUILD_NAME='nuvoras_v2') → @creditappc2.local
// còn lại (default v1) → @creditapp.local

export function getAuthEmailDomain(): string {
  return process.env.NEXT_PUBLIC_BUILD_NAME === 'nuvoras_v2'
    ? '@creditappc2.local'
    : '@creditapp.local';
}

export function buildAuthEmail(username: string): string {
  return `${username}${getAuthEmailDomain()}`;
}

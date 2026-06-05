export const ADMIN_COOKIE = 'admin-session'
export const ADMIN_COOKIE_VALUE = 'authenticated'

export function isValidPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    console.warn('ADMIN_PASSWORD env variable not set')
    return false
  }
  return password === adminPassword
}

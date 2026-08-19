export interface SavedAuthConfig {
  base_url?: string
  login_url?: string
  remember_login?: boolean
  saved_username?: string
  saved_password?: string
  password_configured?: boolean
}

export function configuredLoginUrl(config: SavedAuthConfig | null | undefined): string {
  return config?.login_url?.trim() || ''
}

export interface MoEditorRuntime {
  t: (key: string) => string
  resolvedTheme?: 'light' | 'dark'
  getAdminStory?: (token: string, storyId: string) => Promise<unknown>
  ai?: unknown
  copyToWechat?: (input: { html: string; title?: string; documentId?: string; documentKind?: 'story' | 'blog'; token?: string }) => Promise<void>
  getAgentEndpoint?: (token: string) => Promise<{ baseURL: string; apiKey?: string; headers?: Record<string, string> }>
}

declare module 'vitest/config' {
  export function defineConfig<T>(config: T): T
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_AUTH_MODE?: 'local' | 'supabase'
  readonly VITE_LOCAL_AUTH_SERVER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

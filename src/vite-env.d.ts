/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_TOKEN_AUTH: string
  readonly VITE_AUTH_USERNAME: string
  readonly VITE_AUTH_PASSWORD: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

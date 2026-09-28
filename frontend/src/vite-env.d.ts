/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the NOC backend, e.g. http://localhost:8080. Empty = seeded mode. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

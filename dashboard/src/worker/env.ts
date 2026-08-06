export interface Env {
  ASSETS: Fetcher;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_AUTH_DOMAIN: string;
  FIREBASE_API_KEY?: string;
  SESSION_SIGNING_KEY: string;
  BREAKGLASS_PATH: string;
  BREAKGLASS_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
}

export interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  token_uri: string;
}

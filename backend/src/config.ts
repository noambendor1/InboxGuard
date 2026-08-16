function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface AppConfig {
  port: number;
  sharedSecret: string;
  safeBrowsingApiKey: string | undefined;
  maxRequestAgeSeconds: number;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 8080),
    sharedSecret: requireEnv("INBOXGUARD_SHARED_SECRET"),
    safeBrowsingApiKey: process.env.SAFE_BROWSING_API_KEY || undefined,
    maxRequestAgeSeconds: Number(process.env.MAX_REQUEST_AGE_SECONDS ?? 300)
  };
}

// Runtime config, fetched once at startup from /config.json (deployed
// alongside the built assets by the CDK stack — see infra/lib/luxor-stack.ts,
// "DeployConfig"). This can't be a Vite build-time env var because the
// values (API URL, Cognito pool IDs) aren't known until the stack deploys.

export interface RuntimeConfig {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  awsRegion: string;
}

let cached: Promise<RuntimeConfig> | null = null;

export function loadConfig(): Promise<RuntimeConfig> {
  if (!cached) {
    cached = fetch('/config.json')
      .then((res) => {
        if (!res.ok) throw new Error(`config.json request failed: ${res.status}`);
        return res.json() as Promise<RuntimeConfig>;
      })
      .catch((err) => {
        cached = null; // allow retry
        throw new Error(
          `Could not load /config.json (${err instanceof Error ? err.message : err}). ` +
            'This app expects to run behind the CloudFront distribution created by ' +
            'infra/lib/luxor-stack.ts, which deploys a generated config.json alongside ' +
            'the build. For local development, copy public/config.example.json to ' +
            'public/config.json and fill in values from `cdk deploy` outputs.',
        );
      });
  }
  return cached;
}

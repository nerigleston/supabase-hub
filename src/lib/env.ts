import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export const env = {
  get appUrl() {
    return required("APP_URL").replace(/\/$/, "");
  },
  get awsRegion() {
    // AWS_REGION é reservada na Vercel (região da função); HUB_AWS_REGION manda.
    return process.env.HUB_AWS_REGION ?? process.env.AWS_REGION ?? "us-east-1";
  },
  get table() {
    return required("DYNAMO_TABLE");
  },
  cognito: {
    get userPoolId() {
      return required("COGNITO_USER_POOL_ID");
    },
    get clientId() {
      return required("COGNITO_CLIENT_ID");
    },
    get clientSecret() {
      return required("COGNITO_CLIENT_SECRET");
    },
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get tokenKey() {
    return required("TOKEN_ENCRYPTION_KEY");
  },
  supabase: {
    get clientId() {
      return required("SUPABASE_OAUTH_CLIENT_ID");
    },
    get clientSecret() {
      return required("SUPABASE_OAUTH_CLIENT_SECRET");
    },
    get configured() {
      return Boolean(
        process.env.SUPABASE_OAUTH_CLIENT_ID &&
          process.env.SUPABASE_OAUTH_CLIENT_SECRET,
      );
    },
  },
};

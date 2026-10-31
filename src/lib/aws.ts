import "server-only";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { env } from "./env";

/**
 * Na Vercel: credenciais temporárias via OIDC (AWS_ROLE_ARN), sem chaves guardadas.
 * Local: cadeia padrão do SDK (AWS_PROFILE do .env.local).
 */
export function awsClientConfig() {
  const roleArn = process.env.AWS_ROLE_ARN;
  return {
    region: env.awsRegion,
    ...(roleArn ? { credentials: awsCredentialsProvider({ roleArn }) } : {}),
  };
}

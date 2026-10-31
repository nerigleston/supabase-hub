import "server-only";
import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  RespondToAuthChallengeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { createHmac } from "node:crypto";
import { awsClientConfig } from "./aws";
import { env } from "./env";

const client = new CognitoIdentityProviderClient(awsClientConfig());

let verifier: ReturnType<typeof CognitoJwtVerifier.create<{ userPoolId: string; tokenUse: "id"; clientId: string }>>;
function idVerifier() {
  verifier ??= CognitoJwtVerifier.create({ userPoolId: env.cognito.userPoolId, tokenUse: "id", clientId: env.cognito.clientId });
  return verifier;
}

function secretHash(username: string) {
  return createHmac("sha256", env.cognito.clientSecret).update(username + env.cognito.clientId).digest("base64");
}

const normalize = (email: string) => email.trim().toLowerCase();

/** Mensagens na linguagem do usuário, dizendo o que fazer (heurísticas 2 e 9). */
export function authErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  const raw = (err as Error)?.message ?? "";
  switch (name) {
    case "NotAuthorizedException":
      return /attempts exceeded/i.test(raw)
        ? "Muitas tentativas seguidas. Aguarde alguns minutos ou redefina a senha."
        : "E-mail ou senha incorretos.";
    case "UsernameExistsException":
      return "Já existe uma conta com este e-mail. Entre ou use “Esqueci minha senha”.";
    case "CodeMismatchException":
      return "Código incorreto. Confira o último e-mail recebido.";
    case "ExpiredCodeException":
      return "Este código expirou. Peça um novo.";
    case "InvalidPasswordException":
      return "A senha não atende aos requisitos: mínimo de 12 caracteres, com maiúscula, minúscula e número.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente de novo.";
    case "InvalidParameterException":
      return "Confira os dados digitados.";
    case "CodeDeliveryFailureException":
      return "Não conseguimos enviar o e-mail. Confira o endereço e tente de novo.";
    default:
      console.error("Cognito", name, raw);
      return "Algo deu errado do nosso lado. Tente de novo em instantes.";
  }
}

export type SignInResult =
  | { kind: "ok"; sub: string; email: string }
  | { kind: "new_password"; session: string }
  | { kind: "unconfirmed" };

async function identityFrom(idToken: string) {
  const payload = await idVerifier().verify(idToken);
  return { sub: payload.sub, email: String(payload.email ?? "") };
}

export async function signIn(emailRaw: string, password: string): Promise<SignInResult> {
  const email = normalize(emailRaw);
  try {
    const out = await client.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: env.cognito.clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password, SECRET_HASH: secretHash(email) },
      }),
    );
    if (out.ChallengeName === "NEW_PASSWORD_REQUIRED") return { kind: "new_password", session: out.Session! };
    if (!out.AuthenticationResult?.IdToken) throw new Error(`Desafio não suportado: ${out.ChallengeName}`);
    return { kind: "ok", ...(await identityFrom(out.AuthenticationResult.IdToken)) };
  } catch (err) {
    if ((err as Error).name === "UserNotConfirmedException") return { kind: "unconfirmed" };
    throw err;
  }
}

export async function completeNewPassword(emailRaw: string, session: string, newPassword: string) {
  const email = normalize(emailRaw);
  const out = await client.send(
    new RespondToAuthChallengeCommand({
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ClientId: env.cognito.clientId,
      Session: session,
      ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword, SECRET_HASH: secretHash(email) },
    }),
  );
  if (!out.AuthenticationResult?.IdToken) throw new Error("Falha ao concluir a troca de senha");
  return identityFrom(out.AuthenticationResult.IdToken);
}

export async function signUp(emailRaw: string, password: string, name: string) {
  const email = normalize(emailRaw);
  await client.send(
    new SignUpCommand({
      ClientId: env.cognito.clientId,
      SecretHash: secretHash(email),
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email },
        ...(name.trim() ? [{ Name: "name", Value: name.trim() }] : []),
      ],
    }),
  );
}

export async function confirmSignUp(emailRaw: string, code: string) {
  const email = normalize(emailRaw);
  await client.send(
    new ConfirmSignUpCommand({ ClientId: env.cognito.clientId, SecretHash: secretHash(email), Username: email, ConfirmationCode: code.trim() }),
  );
}

export async function resendCode(emailRaw: string) {
  const email = normalize(emailRaw);
  await client.send(new ResendConfirmationCodeCommand({ ClientId: env.cognito.clientId, SecretHash: secretHash(email), Username: email }));
}

export async function forgotPassword(emailRaw: string) {
  const email = normalize(emailRaw);
  await client.send(new ForgotPasswordCommand({ ClientId: env.cognito.clientId, SecretHash: secretHash(email), Username: email }));
}

export async function confirmForgotPassword(emailRaw: string, code: string, newPassword: string) {
  const email = normalize(emailRaw);
  await client.send(
    new ConfirmForgotPasswordCommand({
      ClientId: env.cognito.clientId,
      SecretHash: secretHash(email),
      Username: email,
      ConfirmationCode: code.trim(),
      Password: newPassword,
    }),
  );
}

#!/usr/bin/env bash
# Instala o gatilho "Custom Email Sender" no Cognito (e-mails de código pelo Resend).
#
# SÓ RODE COM O DOMÍNIO DO EMAIL_FROM JÁ VERIFICADO NO RESEND: depois de ligado,
# os códigos de cadastro e troca de senha passam a sair só por aqui.
#
# Uso:
#   RESEND_API_KEY=re_... USER_POOL_ID=us-east-1_xxx \
#   EMAIL_FROM="BaseHub <convites@seudominio.com>" APP_URL=https://hub.seudominio.com \
#   bash infra/cognito-email-sender/deploy.sh
#
# Desfazer (volta ao remetente padrão do Cognito):
#   ROLLBACK=1 USER_POOL_ID=us-east-1_xxx bash infra/cognito-email-sender/deploy.sh
set -euo pipefail

: "${USER_POOL_ID:?defina USER_POOL_ID}"
PROFILE="${AWS_PROFILE:-default}"
REGION="${AWS_REGION:-us-east-1}"
NAME="basehub-cognito-email-sender"
ALIAS="alias/${NAME}"
aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
POOL_ARN="arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${USER_POOL_ID}"
HERE="$(cd "$(dirname "$0")" && pwd)"

# Reaplica a config ATUAL do pool trocando só o LambdaConfig (update-user-pool
# volta ao padrão tudo o que não for enviado).
update_pool_lambda() {
  local lambda_json="$1"
  aws cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" --output json >"$TMP/pool.json"
  python3 - "$TMP/pool.json" "$lambda_json" "$USER_POOL_ID" >"$TMP/update.json" <<'PY'
import json, sys
pool = json.load(open(sys.argv[1]))["UserPool"]
keep = ["Policies","DeletionProtection","AutoVerifiedAttributes","SmsVerificationMessage","EmailVerificationMessage",
        "EmailVerificationSubject","VerificationMessageTemplate","SmsAuthenticationMessage","UserAttributeUpdateSettings",
        "MfaConfiguration","DeviceConfiguration","EmailConfiguration","SmsConfiguration","UserPoolTags",
        "AdminCreateUserConfig","UserPoolAddOns","AccountRecoverySetting","UserPoolTier"]
out = {k: pool[k] for k in keep if k in pool}
out["UserPoolId"] = sys.argv[3]
lam = json.loads(sys.argv[2])
out["LambdaConfig"] = {**{k: v for k, v in pool.get("LambdaConfig", {}).items() if k not in ("CustomEmailSender", "KMSKeyID")}, **lam}
# AdminCreateUserConfig.UnusedAccountValidityDays é descontinuado e rejeitado no update
out.get("AdminCreateUserConfig", {}).pop("UnusedAccountValidityDays", None)
# o texto padrão (usado se o gatilho for removido) com o nome novo
out.setdefault("VerificationMessageTemplate", {}).update({
  "EmailSubject": "Seu código do BaseHub",
  "EmailMessage": "Seu código de verificação do BaseHub é {####}",
  "DefaultEmailOption": "CONFIRM_WITH_CODE"})
out.pop("EmailVerificationMessage", None); out.pop("EmailVerificationSubject", None)
print(json.dumps(out))
PY
  aws cognito-idp update-user-pool --cli-input-json "file://$TMP/update.json"
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [[ "${ROLLBACK:-}" == "1" ]]; then
  update_pool_lambda '{}'
  echo "Gatilho removido: o Cognito voltou a enviar pelo remetente padrão."
  exit 0
fi

: "${RESEND_API_KEY:?defina RESEND_API_KEY}"
EMAIL_FROM="${EMAIL_FROM:-BaseHub <convites@nerifilho.com.br>}"
APP_URL="${APP_URL:-https://basehub.nerifilho.com.br}"

# 1) Chave KMS: o Cognito criptografa o código com ela; a Lambda descriptografa.
KEY_ARN=$(aws kms describe-key --key-id "$ALIAS" --query KeyMetadata.Arn --output text 2>/dev/null || true)
if [[ -z "$KEY_ARN" || "$KEY_ARN" == "None" ]]; then
  cat >"$TMP/key-policy.json" <<JSON
{"Version":"2012-10-17","Statement":[
 {"Sid":"Conta","Effect":"Allow","Principal":{"AWS":"arn:aws:iam::${ACCOUNT}:root"},"Action":"kms:*","Resource":"*"},
 {"Sid":"Cognito","Effect":"Allow","Principal":{"Service":"cognito-idp.amazonaws.com"},"Action":["kms:Encrypt","kms:GenerateDataKey"],"Resource":"*",
  "Condition":{"StringEquals":{"aws:SourceAccount":"${ACCOUNT}"},"ArnLike":{"aws:SourceArn":"${POOL_ARN}"}}}]}
JSON
  KEY_ARN=$(aws kms create-key --description "BaseHub: códigos do Cognito para o Custom Email Sender" --policy "file://$TMP/key-policy.json" --query KeyMetadata.Arn --output text)
  aws kms create-alias --alias-name "$ALIAS" --target-key-id "$KEY_ARN"
fi
echo "KMS: $KEY_ARN"

# 2) Role da Lambda: logs + descriptografar com a chave.
ROLE_ARN=$(aws iam get-role --role-name "$NAME" --query Role.Arn --output text 2>/dev/null || true)
if [[ -z "$ROLE_ARN" || "$ROLE_ARN" == "None" ]]; then
  ROLE_ARN=$(aws iam create-role --role-name "$NAME" --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    --query Role.Arn --output text)
  aws iam attach-role-policy --role-name "$NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10 # a role leva alguns segundos para valer
fi
aws iam put-role-policy --role-name "$NAME" --policy-name kms-decrypt --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"kms:Decrypt\",\"Resource\":\"${KEY_ARN}\"}]}"
echo "Role: $ROLE_ARN"

# 3) Pacote da função (montado fora do SSD exFAT, sem arquivos ._*).
cp "$HERE/index.mjs" "$HERE/package.json" "$TMP/"
(cd "$TMP" && npm install --omit=dev --silent && zip -qr function.zip index.mjs package.json node_modules)
ENV="Variables={RESEND_API_KEY=${RESEND_API_KEY},EMAIL_FROM='${EMAIL_FROM}',KEY_ARN=${KEY_ARN},APP_URL=${APP_URL}}"
if aws lambda get-function --function-name "$NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$NAME" --zip-file "fileb://$TMP/function.zip" >/dev/null
  aws lambda wait function-updated --function-name "$NAME"
  aws lambda update-function-configuration --function-name "$NAME" --environment "$ENV" >/dev/null
else
  aws lambda create-function --function-name "$NAME" --runtime nodejs22.x --handler index.handler --timeout 10 --memory-size 256 \
    --role "$ROLE_ARN" --zip-file "fileb://$TMP/function.zip" --environment "$ENV" >/dev/null
  aws lambda add-permission --function-name "$NAME" --statement-id cognito --action lambda:InvokeFunction \
    --principal cognito-idp.amazonaws.com --source-arn "$POOL_ARN" >/dev/null
fi
aws lambda wait function-updated --function-name "$NAME"
LAMBDA_ARN=$(aws lambda get-function --function-name "$NAME" --query Configuration.FunctionArn --output text)
echo "Lambda: $LAMBDA_ARN"

# 4) Liga o gatilho no pool (preservando o resto da configuração).
update_pool_lambda "{\"CustomEmailSender\":{\"LambdaVersion\":\"V1_0\",\"LambdaArn\":\"${LAMBDA_ARN}\"},\"KMSKeyID\":\"${KEY_ARN}\"}"
echo "Pronto: os códigos do Cognito agora saem pelo Resend (${EMAIL_FROM})."

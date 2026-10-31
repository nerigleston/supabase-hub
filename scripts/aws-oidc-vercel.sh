#!/usr/bin/env bash
# Dá à Vercel acesso à tabela DynamoDB via OIDC (sem chaves da AWS).
# Rode uma vez:  VERCEL_TEAM=<slug-do-seu-time> bash scripts/aws-oidc-vercel.sh
# Opcionais: VERCEL_PROJECT (padrão supabase-hub), DYNAMO_TABLE (padrão supabase-hub),
#            HUB_AWS_REGION (padrão us-east-1), AWS_PROFILE (padrão default).
set -euo pipefail
TEAM="${VERCEL_TEAM:?Defina VERCEL_TEAM com o slug do seu time na Vercel}"
PROJECT="${VERCEL_PROJECT:-supabase-hub}"
TABLE="${DYNAMO_TABLE:-supabase-hub}"
export AWS_PROFILE="${AWS_PROFILE:-default}" AWS_REGION="${HUB_AWS_REGION:-us-east-1}"
ACC=$(aws sts get-caller-identity --query Account --output text)
TMP=$(mktemp -d)

aws iam create-open-id-connect-provider \
  --url "https://oidc.vercel.com/$TEAM" \
  --client-id-list "https://vercel.com/$TEAM" \
  --tags Key=app,Value=supabase-hub >/dev/null || echo "(provedor OIDC já existe)"

cat > "$TMP/trust.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::$ACC:oidc-provider/oidc.vercel.com/$TEAM" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "oidc.vercel.com/$TEAM:aud": "https://vercel.com/$TEAM" },
      "StringLike": { "oidc.vercel.com/$TEAM:sub": "owner:$TEAM:project:$PROJECT:environment:*" }
    }
  }]
}
JSON

cat > "$TMP/policy.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"],
    "Resource": "arn:aws:dynamodb:$AWS_REGION:$ACC:table/$TABLE"
  }]
}
JSON

aws iam create-role --role-name supabase-hub-vercel \
  --assume-role-policy-document "file://$TMP/trust.json" \
  --description "Supabase Hub na Vercel (OIDC) - so a tabela $TABLE" \
  --tags Key=app,Value=supabase-hub >/dev/null || echo "(role já existe)"
aws iam put-role-policy --role-name supabase-hub-vercel \
  --policy-name dynamodb-supabase-hub --policy-document "file://$TMP/policy.json"

echo "AWS_ROLE_ARN=arn:aws:iam::$ACC:role/supabase-hub-vercel"

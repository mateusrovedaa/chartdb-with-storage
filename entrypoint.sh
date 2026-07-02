#!/bin/sh

# Replace placeholders in nginx.conf
envsubst '${OPENAI_API_KEY} ${OPENAI_API_ENDPOINT} ${LLM_MODEL_NAME} ${HIDE_CHARTDB_CLOUD} ${DISABLE_ANALYTICS}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Torna o volume de schemas gravavel pelo worker do nginx (uid 101), para o
# botao "Publish to Live" (PUT). Silencioso e nao-fatal se o volume for :ro
# (modo somente-leitura, alimentado por job externo).
chown -R nginx:nginx /usr/share/nginx/schema-data 2>/dev/null || true

# Start Nginx
nginx -g "daemon off;"

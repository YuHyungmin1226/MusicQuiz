FROM caddy:2.8-alpine

WORKDIR /srv
COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html /srv/index.html
COPY favicon.svg /srv/favicon.svg

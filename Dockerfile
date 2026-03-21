# Dockerfile for Koto CMS (x86_64)
# For ARM64 deployment, use Dockerfile.arm64

FROM hexpm/elixir:1.17.3-erlang-27.1.2-alpine-3.20.3 AS build

RUN apk add --no-cache build-base git

WORKDIR /app

RUN mix local.hex --force && \
    mix local.rebar --force

ENV MIX_ENV=prod

# Install dependencies
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod
RUN mix deps.compile

# Copy application code
COPY config config
COPY lib lib

# Compile and build release
RUN mix compile
RUN mix release

# Lightweight runtime image
FROM alpine:3.20.3 AS app

RUN apk add --no-cache libstdc++ openssl ncurses-libs

WORKDIR /app

RUN chown nobody:nobody /app

USER nobody:nobody

# Copy release from build stage
COPY --from=build --chown=nobody:nobody /app/_build/prod/rel/koto_cms ./

ENV HOME=/app
ENV PORT=3000

# Run the server
CMD ["bin/koto_cms", "start"]

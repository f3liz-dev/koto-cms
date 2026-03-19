FROM denoland/deno:2.3.3 AS build
WORKDIR /function
COPY src ./src
RUN deno compile --allow-net --allow-env --output fn-server src/func.ts

# Use a lightweight, standard OCI-friendly base image
FROM oraclelinux:9-slim

RUN groupadd --gid 1000 fn && \
    useradd --uid 1000 --gid 1000 fn

WORKDIR /function
COPY --chown=fn:fn --from=build /function/fn-server .

USER fn

ENTRYPOINT ["./fn-server"]

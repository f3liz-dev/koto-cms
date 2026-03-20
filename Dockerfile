FROM denoland/deno:2.3.3 AS build
WORKDIR /function
COPY src ./src
RUN for i in 1 2 3; do \
      deno compile --allow-net --allow-env --allow-read --allow-write --output fn-server src/func.ts && break; \
      echo "Retry $i failed, retrying..."; \
      [ $i -eq 3 ] && exit 1; \
      sleep 5; \
    done

# Use a lightweight, standard OCI-friendly base image
FROM oraclelinux:9-slim

RUN groupadd --gid 1000 fn && \
    useradd --uid 1000 --gid 1000 fn

WORKDIR /function
COPY --chown=fn:fn --from=build /function/fn-server .

USER fn

ENTRYPOINT ["./fn-server"]

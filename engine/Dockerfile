FROM rust:1.98-alpine AS builder

ARG CARGO_BUILD_JOBS=2
ENV CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS}

RUN apk add --no-cache gcc musl-dev

WORKDIR /engine

COPY engine ./

RUN cargo build --release --locked --bin engine --bin engine-tools

FROM alpine:3.22

COPY --from=builder /engine/target/release/engine /engine/target/release/engine-tools /usr/local/bin/

USER nobody

CMD ["engine"]

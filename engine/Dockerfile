# syntax=docker/dockerfile:1
FROM rust:1.98.0-alpine AS builder

ARG CARGO_BUILD_JOBS=2
ENV CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS}

RUN apk add --no-cache gcc musl-dev

WORKDIR /engine

COPY engine/rust-toolchain.toml ./
RUN rustup toolchain install

COPY engine ./

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/engine/target \
    cargo build --release --locked --bin engine --bin engine-tools \
    && cp target/release/engine target/release/engine-tools /usr/local/bin/

FROM alpine:3.22

COPY --from=builder /usr/local/bin/engine /usr/local/bin/engine-tools /usr/local/bin/

USER nobody

CMD ["engine"]

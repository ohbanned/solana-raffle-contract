#!/bin/bash
set -e

# Clean up any existing build artifacts and lock file
rm -f Cargo.lock
rm -rf target

# Compile using direct cargo-build-sbf command with specific flags
echo "Building Solana program..."
export SBF_OUT_DIR=./target/deploy
cargo build-sbf --sbf-c-opt-level=2 --sbf-c-compiler=path

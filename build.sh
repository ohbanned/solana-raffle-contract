#!/bin/bash
set -e

# Navigate to the program directory
cd "$(dirname "$0")/program"

# Remove the existing Cargo.lock which has version issues
rm -f Cargo.lock

# Force using cargo v1.68.0 which is more compatible with Solana tooling
# The --no-manifest-path flag helps with workspace issues
cargo +1.68.0 build-sbf --no-default-features --sbf-out-dir=./target/deploy

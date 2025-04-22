#!/bin/bash
set -e

# Change to the program directory
cd "$(dirname "$0")/program"

# Remove the Cargo.lock file with version issues
rm -f Cargo.lock

# Create a simpler version of the Cargo.lock file that works with older Solana tooling
echo '[root]
name = "solcino"
version = "0.1.0"
dependencies = []

[[package]]
name = "solcino"
version = "0.1.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
' > Cargo.lock

# Build with current Solana CLI
echo "Building program..."
solana program build

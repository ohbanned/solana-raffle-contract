#!/bin/bash

# Run the Solana raffle contract tests
echo "=== Running SolCino Raffle Contract Tests ==="
echo "Program ID: 9BLyPzJR2r8sYbRaaKi8tCKMvFfLxTsnfs9P5JJxaXds"
echo ""

# Run the tests with increased timeout and verbosity
RUST_BACKTRACE=1 cargo test -- --nocapture

# Check the test results
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ All tests passed!"
else
  echo ""
  echo "❌ Some tests failed."
fi

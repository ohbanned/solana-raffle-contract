# SolCino Raffle Program

A Solana-based raffle program that enables secure, transparent, and fully decentralized automated raffles on the Solana blockchain. This program is part of the SolCino Casino Platform.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [File Structure](#file-structure)
- [Function Reference](#function-reference)
- [Program Instructions](#program-instructions)
- [Account Structure](#account-structure)
- [Building and Deployment](#building-and-deployment)
- [Testing](#testing)
- [Integration Guide](#integration-guide)
- [Security Considerations](#security-considerations)

## Overview

SolCino Raffle Program is a fully on-chain, decentralized raffle system that allows any user to create raffles, purchase tickets, and complete raffles with automatic prize distribution to winners. The program provides a transparent and fair raffle mechanism with configurable parameters.

## Features

- **Fully Decentralized**: Anyone can create, enter, and complete raffles - no central authority

- **Secure Account Management**: Uses Program Derived Addresses (PDAs) for all critical accounts
  - No private keys needed for raffle accounts
  - Deterministic account derivation through on-chain seeds
  - Enhanced security through program-owned accounts

- **Raffle Creation**: Create customizable raffles with configurable parameters
  - Title
  - Duration
  - Fixed ticket price set globally in Config
  - Fixed fee percentage set globally in Config

- **Ticket Purchase**: Users can buy multiple tickets for active raffles
  - No limits on ticket purchases
  - SOL-based payments
  - Fee distribution to treasury
  - Automatic prize pool accumulation

- **Raffle Completion**: Secure winner selection and prize distribution
  - Time-based completion
  - Switchboard VRF for provably fair randomness
  - Immediate prize distribution to winner
  - Secure and verifiable randomness

## Architecture

The program follows standard Solana program architecture with separation of concerns:

- **State**: Data structures for storing raffle and ticket information
- **Instructions**: Input validation and instruction handling
- **Processor**: Business logic implementation for each instruction
- **Error Handling**: Custom error types with descriptive messages

## File Structure

The SolCino Raffle program consists of the following source files (1,887 lines of code total):

| File | Lines | Description |
|------|-------|-------------|
| **lib.rs** | 31 | Entry point to the program with module declarations |
| **raffle_error.rs** | 58 | Error definitions used throughout the program |
| **raffle_instruction.rs** | 494 | Instruction definitions, unpacking, and instruction creation helpers |
| **raffle_processor.rs** | 851 | Core business logic for processing all program instructions |
| **raffle_state.rs** | 245 | Data structures and serialization for on-chain state |
| **utils.rs** | 37 | Utility functions for fee calculation and address derivation |
| **vrf.rs** | 171 | Verifiable Random Function implementation for secure randomness |

### lib.rs (31 lines)
Defines the single entry point to the program and includes all modules.

### raffle_error.rs (58 lines)
Defines custom error types with descriptive messages for better debugging and user feedback.

### raffle_instruction.rs (494 lines)
Defines all available instructions, their account requirements, and parameter formats. Includes helper functions for creating instruction objects.

### raffle_processor.rs (851 lines)
Contains the implementation of all instruction processing logic, handling account validation, state updates, and token transfers.

### raffle_state.rs (245 lines)
Defines the data structures for storing raffle state on-chain, including serialization/deserialization methods.

### utils.rs (37 lines)
Provides utility functions used throughout the program, including fee calculations and address derivation.

### vrf.rs (171 lines)
Implements integration with Switchboard's Verifiable Random Function for secure, provable randomness in winner selection.

## Function Reference

Here's a comprehensive list of all public functions available in the SolCino Raffle program:

### Client Instruction Functions
These functions create instructions that can be included in transactions:

```javascript
// From raffle_instruction.rs

// Initialize global configuration (admin only)
initialize_config(program_id, admin, config_account, treasury, ticket_price, fee_basis_points)

// Create a new raffle (anyone can call)
initialize_raffle(program_id, initiator, raffle_account, config_account, title, duration)

// Purchase tickets for a raffle (anyone can call)
purchase_tickets(program_id, purchaser, raffle_account, ticket_purchase_account, treasury, ticket_count)

// Request VRF randomness - Step 1 of completion (anyone can call)
request_randomness(program_id, initiator, raffle_account, vrf_account, payer, switchboard_program, oracle_queue, remaining_accounts)

// Complete raffle with VRF result - Step 2 of completion (anyone can call)
complete_raffle_with_vrf(program_id, initiator, raffle_account, vrf_account, winner, switchboard_program)

// Admin functions (require admin signature)
update_admin(program_id, current_admin, new_admin, config_account)
update_fee_address(program_id, admin, new_fee_address, config_account)
update_ticket_price(program_id, admin, config_account, new_ticket_price)
update_fee_percentage(program_id, admin, config_account, new_fee_basis_points)
```

### Utility Functions
These helper functions are used internally and can be called from client code:

```javascript
// From utils.rs

// Calculate fee amount based on input amount and basis points
calculate_fee(amount, basis_points)

// Calculate number of entries based on SOL amount
calculate_entries(amount_lamports)

// Find a program derived address for a raffle
find_raffle_address(program_id, raffle_id)

// Find a program derived address for a raffle entry
find_entry_address(program_id, raffle_id, user)

// Convert lamports to SOL (for display purposes)
lamports_to_sol(lamports)

// Convert SOL to lamports
sol_to_lamports(sol)
```

### VRF Functions
These functions handle secure randomness for winner selection:

```javascript
// From vrf.rs

// Verifies and retrieves the result from a VRF account
verify_vrf_result(vrf_account_info, switchboard_program)

// Requests randomness from the Switchboard VRF
request_vrf_randomness(vrf_account_info, payer_account_info, initiator_account_info, switchboard_program, oracle_queue_info, permission_account_info, escrow_account_info, payer_wallet_info, remaining_accounts)

// Converts VRF random bytes into a ticket index for winner selection
get_random_winner_index(vrf_result, total_tickets)
```

## Program Instructions

### Initialize Raffle
```
Accounts:
1. [signer, writable] Authority - The creator of the raffle
2. [writable] Raffle Account - New account to store raffle data
3. [] Config Account - Contains ticket price and fee settings
4. [] System Program
5. [] Clock Sysvar

Parameters:
- title: [u8; 32] - Title of the raffle (max 32 bytes)
- duration: u64 - Duration of the raffle in seconds
```

### Purchase Tickets
```
Accounts:
1. [signer, writable] Purchaser - Account buying tickets
2. [writable] Raffle Account - The raffle to enter
3. [writable] Ticket Purchase Account - Record of ticket purchase (PDA)
4. [writable] Treasury Account - To receive fees
5. [] System Program
6. [] Clock Sysvar

Parameters:
- ticket_count: u64 - Number of tickets to purchase
```

### Request Randomness (VRF)
```
Accounts:
1. [signer] Authority - The raffle creator
2. [writable] Raffle Account - The raffle to complete
3. [writable] VRF Account - Switchboard VRF account
4. [signer] Payer - Account paying for the VRF request
5. [] Switchboard Program - Switchboard program ID
6. [] Oracle Queue - Switchboard oracle queue

Parameters: None
```

### Complete Raffle With VRF
```
Accounts:
1. [signer] Authority - The raffle creator
2. [writable] Raffle Account - The raffle to complete
3. [] VRF Account - Switchboard VRF account with result
4. [writable] Winner Account - Account to receive the prize
5. [] Switchboard Program - Switchboard program ID

Parameters: None
```

### Update Admin
```
Accounts:
1. [signer] Current Admin - The current admin authority
2. [] New Admin - The new admin address
3. [writable] Config Account - Program configuration account

Parameters: None
```

### Update Fee Address
```
Accounts:
1. [signer] Admin - The admin authority
2. [] New Fee Address - The new treasury address to receive fees
3. [writable] Config Account - Program configuration account

Parameters: None
```

## Account Structure

### Raffle Account
```rust
pub struct Raffle {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub title: [u8; 32],
    pub end_time: UnixTimestamp,
    pub status: RaffleStatus, // Active or Complete only
    pub winner: Pubkey,
    pub tickets_sold: u64,
    pub vrf_account: Pubkey,
    pub vrf_request_in_progress: bool,
}
```

### Config Account
```rust
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub ticket_price: u64,
    pub fee_basis_points: u16,
}
```

### Ticket Purchase Account
```rust
pub struct TicketPurchase {
    pub is_initialized: bool,
    pub raffle: Pubkey,
    pub purchaser: Pubkey,
    pub ticket_count: u64,
    pub purchase_time: UnixTimestamp,
}
```

## Building and Deployment

### Prerequisites
- Rust and Cargo
- Solana CLI
- Solana Testnet/Devnet account with SOL
- Switchboard VRF Account (created via our setup script)

### Build Instructions
```bash
# Clone the repository
git clone https://github.com/ohbanned/solana-raffle-contract.git
cd solana-raffle-contract/program

# Build the program
cargo build-bpf

# Deploy to devnet
solana program deploy target/deploy/solcino_program.so --keypair path/to/keypair.json --url devnet
```

## Testing

The program includes comprehensive tests to ensure functionality:

```bash
# Run all tests
cargo test-bpf
```

## Integration Guide

To integrate with the SolCino Raffle Program:

1. **Create a Raffle**:
   - Generate a new account for the raffle
   - Call `initialize_raffle` instruction

2. **Purchase Tickets**:
   - Derive the PDA for ticket purchase record
   - Call `purchase_tickets` instruction

3. **Complete a Raffle with VRF (2-step process)**:
   - After end time has passed
   - Step 1: Call `request_randomness` instruction to request VRF randomness
   - Step 2: Once VRF result is ready, call `complete_raffle_with_vrf` instruction
   - Winner's ticket record is a PDA derived from the raffle and ticket index

4. **Admin Functions** (limited to deployer or designated admin):
   - Update admin address with `update_admin`
   - Update fee address with `update_fee_address`
   - Update ticket price with `update_ticket_price`

## Security Considerations

- The raffle winner selection uses Switchboard's Verifiable Random Function (VRF) for secure and provably fair randomness.
- All critical accounts use Program Derived Addresses (PDAs) for enhanced security.
- No private keys are needed for raffle accounts, eliminating the risk of key exposure.
- Time-based constraints prevent early completion.
- This is a fully decentralized platform with zero admin control over user funds or raffle outcomes.
- Admin functionality is limited strictly to transferring admin rights and updating the fee collection address.

## License

[MIT License](LICENSE)

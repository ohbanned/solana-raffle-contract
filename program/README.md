# SolCino Raffle Program

A Solana-based raffle program that enables secure, transparent, and automated raffles on the Solana blockchain. This program is part of the SolCino Casino Platform.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Program Instructions](#program-instructions)
- [Account Structure](#account-structure)
- [Building and Deployment](#building-and-deployment)
- [Testing](#testing)
- [Integration Guide](#integration-guide)
- [Security Considerations](#security-considerations)

## Overview

SolCino Raffle Program is a fully on-chain raffle system that allows users to create raffles, purchase tickets, and automatically distribute prizes to winners. The program provides a transparent and fair raffle mechanism with configurable parameters.

## Features

- **Raffle Creation**: Create customizable raffles with configurable parameters
  - Title
  - Duration
  - Fixed ticket price set globally in Config
  - Fixed fee percentage set globally in Config

- **Ticket Purchase**: Users can buy multiple tickets for active raffles
  - SOL-based payments
  - Fee distribution to treasury
  - Automatic prize pool accumulation

- **Raffle Completion**: Secure winner selection and prize distribution
  - Time-based completion
  - Switchboard VRF for provably fair randomness
  - Two-step completion process for verified randomness
  - Immediate prize distribution



## Architecture

The program follows standard Solana program architecture with separation of concerns:

- **State**: Data structures for storing raffle and ticket information
- **Instructions**: Input validation and instruction handling
- **Processor**: Business logic implementation for each instruction
- **Error Handling**: Custom error types with descriptive messages

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
git clone https://github.com/your-repo/solcino.git
cd solcino/program

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

4. **Admin Functions** (limited to deployer or designated admin):
   - Update admin address with `update_admin`
   - Update fee address with `update_fee_address`
   - Update ticket price with `update_ticket_price`

## Security Considerations

- The raffle winner selection uses Switchboard's Verifiable Random Function (VRF) for secure and provably fair randomness.
- Authority checks ensure only the raffle creator can complete raffles.
- Time-based constraints prevent early completion.
- This is a fully decentralized platform with zero admin control over user funds or raffle outcomes.
- Admin functionality is limited strictly to transferring admin rights and updating the fee collection address.

## License

[MIT License](LICENSE)

use solana_program::{
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
    sysvar::clock,
};
use std::convert::TryInto;
use std::mem::size_of;

#[derive(Clone, Debug, PartialEq)]
pub enum RaffleInstruction {
    /// Initialize the config for the raffle program
    ///
    /// Accounts expected:
    /// 0. `[signer, writable]` The admin account who will have control over configuration
    /// 1. `[writable]` The config account (PDA)
    /// 2. `[]` Treasury account that will receive fees
    /// 3. `[]` The system program
    InitializeConfig {
        /// Price per ticket in lamports (0.1 SOL = 100,000,000 lamports)
        ticket_price: u64,
        /// Fee percentage in basis points (e.g., 500 = 5%)
        fee_basis_points: u16,
    },
    
    /// Initialize a new raffle
    ///
    /// Accounts expected:
    /// 0. `[signer, writable]` The authority/creator of the raffle who pays for the raffle account
    /// 1. `[writable]` The raffle account, must be uninitialized
    /// 2. `[]` Config account with raffle settings
    /// 3. `[]` The system program
    /// 4. `[]` The clock sysvar
    InitializeRaffle {
        /// Title of the raffle (max 32 chars)
        title: [u8; 32],
        /// Duration of the raffle in seconds
        duration: u64,
    },

    /// Purchase tickets for a raffle
    ///
    /// Accounts expected:
    /// 0. `[signer, writable]` The ticket purchaser account (pays for tickets)
    /// 1. `[writable]` The raffle account
    /// 2. `[writable]` The ticket purchase record account (PDA)
    /// 3. `[writable]` Treasury account to receive fees
    /// 4. `[]` The system program
    /// 5. `[]` The clock sysvar
    PurchaseTickets {
        /// Number of tickets to purchase
        ticket_count: u64,
    },

    /// Complete the raffle and pick a winner
    ///
    /// Accounts expected:
    /// 0. `[signer]` Any user (fully decentralized - anyone can initiate this action)
    /// 1. `[writable]` The raffle account
    /// 2. `[writable]` The prize recipient (winner)
    /// 3. `[]` The clock sysvar
    CompleteRaffle {},

    /// Update admin address (admin only)
    ///
    /// Accounts expected:
    /// 0. `[signer]` Current admin authority
    /// 1. `[]` New admin address
    /// 2. `[writable]` Config account
    UpdateAdmin {},
    
    /// Update fee address (admin only)
    ///
    /// Accounts expected:
    /// 0. `[signer]` The admin authority
    /// 1. `[]` The new fee address
    /// 2. `[writable]` Config account
    UpdateFeeAddress {},

    /// Update the ticket price
    ///
    /// Accounts expected:
    /// 0. `[signer]` The admin authority
    /// 1. `[writable]` Config account
    /// Parameter: new_ticket_price: Price per ticket in lamports (0.025 SOL = 25,000,000 lamports)
    UpdateTicketPrice {
        /// New price per ticket in lamports
        new_ticket_price: u64,
    },

    /// Update fee percentage (admin only)
    ///
    /// Accounts expected:
    /// 0. `[signer]` Admin authority
    /// 1. `[writable]` Config account
    UpdateFeePercentage {
        /// New fee percentage in basis points (e.g., 500 = 5%)
        new_fee_basis_points: u16,
    },

    /// Request VRF randomness for a raffle (step 1 of raffle completion)
    ///
    /// Accounts expected:
    /// 0. `[signer]` Any user (fully decentralized - anyone can initiate this action)
    /// 1. `[writable]` The raffle account
    /// 2. `[writable]` The VRF account
    /// 3. `[signer, writable]` The payer account (pays for VRF request)
    /// 4. `[]` The switchboard program account
    /// 5. `[]` The oracle queue account
    /// Remaining accounts needed by Switchboard VRF
    RequestRandomness {},

    /// Complete the raffle with VRF result (step 2 of raffle completion)
    ///
    /// Accounts expected:
    /// 0. `[signer]` Any user (fully decentralized - anyone can initiate this action)
    /// 1. `[writable]` The raffle account
    /// 2. `[]` The VRF account (must have a valid result)
    /// 3. `[writable]` The prize recipient (winner)
    /// 4. `[]` The switchboard program account
    /// 5. `[]` The clock sysvar
    CompleteRaffleWithVrf {},
}

impl RaffleInstruction {
    /// Unpacks a byte buffer into a RaffleInstruction
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (tag, rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;

        Ok(match tag {
            0 => {
                if rest.len() < 10 {
                    return Err(ProgramError::InvalidInstructionData);
                }
                
                let ticket_price = rest[0..8].try_into()
                    .map(u64::from_le_bytes)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                
                let fee_basis_points = rest[8..10].try_into()
                    .map(u16::from_le_bytes)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;

                Self::InitializeConfig {
                    ticket_price,
                    fee_basis_points,
                }
            },
            1 => {
                if rest.len() < 40 {
                    // Need at least 32 bytes for title and 8 bytes for duration
                    return Err(ProgramError::InvalidInstructionData);
                }
                
                let title = {
                    let mut array = [0u8; 32];
                    let title_bytes = &rest[0..32];
                    array.copy_from_slice(title_bytes);
                    array
                };
                
                let duration = rest[32..40].try_into()
                    .map(u64::from_le_bytes)
                    .map_err(|_| ProgramError::InvalidInstructionData)?;

                Self::InitializeRaffle {
                    title,
                    duration,
                }
            }
            2 => {
                let ticket_count = rest[0..8].try_into().map(u64::from_le_bytes).map_err(|_| ProgramError::InvalidInstructionData)?;
                Self::PurchaseTickets { ticket_count }
            }
            3 => Self::CompleteRaffle {},
            4 => Self::UpdateAdmin {},
            5 => Self::UpdateFeeAddress {},
            6 => {
                let new_ticket_price = rest[0..8].try_into().map(u64::from_le_bytes).map_err(|_| ProgramError::InvalidInstructionData)?;
                Self::UpdateTicketPrice { new_ticket_price }
            },
            7 => {
                let new_fee_basis_points = rest[0..2].try_into().map(u16::from_le_bytes).map_err(|_| ProgramError::InvalidInstructionData)?;
                Self::UpdateFeePercentage { new_fee_basis_points }
            },
            8 => Self::RequestRandomness {},
            9 => Self::CompleteRaffleWithVrf {},
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }

    /// Packs a RaffleInstruction into a byte buffer
    pub fn pack(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(size_of::<Self>());

        match self {
            Self::InitializeConfig { ticket_price, fee_basis_points } => {
                buf.push(0);
                buf.extend_from_slice(&ticket_price.to_le_bytes());
                buf.extend_from_slice(&fee_basis_points.to_le_bytes());
            }
            Self::InitializeRaffle { title, duration } => {
                buf.push(1);
                buf.extend_from_slice(title);
                buf.extend_from_slice(&duration.to_le_bytes());
            }
            Self::PurchaseTickets { ticket_count } => {
                buf.push(2);
                buf.extend_from_slice(&ticket_count.to_le_bytes());
            }
            Self::CompleteRaffle {} => {
                buf.push(3);
            }
            Self::UpdateAdmin {} => {
                buf.push(4);
            }
            Self::UpdateFeeAddress {} => {
                buf.push(5);
            }
            Self::UpdateTicketPrice { new_ticket_price } => {
                buf.push(6);
                buf.extend_from_slice(&new_ticket_price.to_le_bytes());
            }
            Self::UpdateFeePercentage { new_fee_basis_points } => {
                buf.push(7);
                buf.extend_from_slice(&new_fee_basis_points.to_le_bytes());
            }
            Self::RequestRandomness {} => {
                buf.push(8);
            }
            Self::CompleteRaffleWithVrf {} => {
                buf.push(9);
            }
        }

        buf
    }
}

/// Create initialize_config instruction
pub fn initialize_config(
    program_id: &Pubkey,
    admin: &Pubkey,
    config_account: &Pubkey,
    treasury: &Pubkey,
    ticket_price: u64,
    fee_basis_points: u16,
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::InitializeConfig {
        ticket_price,
        fee_basis_points,
    }
    .pack();

    let accounts = vec![
        AccountMeta::new(*admin, true),
        AccountMeta::new(*config_account, false),
        AccountMeta::new_readonly(*treasury, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

/// Create initialize_raffle instruction
pub fn initialize_raffle(
    program_id: &Pubkey,
    authority: &Pubkey,
    raffle_account: &Pubkey,
    config_account: &Pubkey,
    title: [u8; 32],
    duration: u64,
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::InitializeRaffle {
        title,
        duration,
    }
    .pack();

    let accounts = vec![
        AccountMeta::new(*authority, true),
        AccountMeta::new(*raffle_account, false),
        AccountMeta::new_readonly(*config_account, false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(clock::id(), false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

/// Create purchase_tickets instruction
pub fn purchase_tickets(
    program_id: &Pubkey,
    purchaser: &Pubkey,
    raffle_account: &Pubkey,
    ticket_purchase_account: &Pubkey,
    treasury: &Pubkey,
    ticket_count: u64,
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::PurchaseTickets { ticket_count }.pack();

    let accounts = vec![
        AccountMeta::new(*purchaser, true),
        AccountMeta::new(*raffle_account, false),
        AccountMeta::new(*ticket_purchase_account, false),
        AccountMeta::new(*treasury, false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(clock::id(), false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

/// Create complete_raffle instruction
pub fn complete_raffle(
    program_id: &Pubkey,
    authority: &Pubkey,
    raffle_account: &Pubkey,
    winner: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::CompleteRaffle {}.pack();

    let accounts = vec![
        AccountMeta::new(*authority, true),
        AccountMeta::new(*raffle_account, false),
        AccountMeta::new(*winner, false),
        AccountMeta::new_readonly(clock::id(), false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

/// Create update_admin instruction
pub fn update_admin(
    program_id: &Pubkey,
    current_admin: &Pubkey,
    new_admin: &Pubkey,
    config_account: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::UpdateAdmin {}.pack();

    let accounts = vec![
        AccountMeta::new(*current_admin, true),
        AccountMeta::new_readonly(*new_admin, false),
        AccountMeta::new(*config_account, false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

/// Create update_fee_address instruction
pub fn update_fee_address(
    program_id: &Pubkey,
    admin: &Pubkey,
    new_fee_address: &Pubkey,
    config_account: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::UpdateFeeAddress {}.pack();

    let accounts = vec![
        AccountMeta::new(*admin, true),
        AccountMeta::new_readonly(*new_fee_address, false),
        AccountMeta::new(*config_account, false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

/// Create update_ticket_price instruction
pub fn update_ticket_price(
    program_id: &Pubkey,
    admin: &Pubkey,
    config_account: &Pubkey,
    new_ticket_price: u64,
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::UpdateTicketPrice { new_ticket_price }.pack();

    let accounts = vec![
        AccountMeta::new(*admin, true),
        AccountMeta::new(*config_account, false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

/// Create update_fee_percentage instruction
pub fn update_fee_percentage(
    program_id: &Pubkey,
    admin: &Pubkey,
    config_account: &Pubkey,
    new_fee_basis_points: u16,
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::UpdateFeePercentage { new_fee_basis_points }.pack();

    let accounts = vec![
        AccountMeta::new(*admin, true),
        AccountMeta::new(*config_account, false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

/// Create request_randomness instruction
pub fn request_randomness(
    program_id: &Pubkey,
    authority: &Pubkey,
    raffle_account: &Pubkey,
    vrf_account: &Pubkey,
    payer: &Pubkey,
    switchboard_program: &Pubkey,
    oracle_queue: &Pubkey,
    remaining_accounts: &[AccountMeta],
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::RequestRandomness {}.pack();

    // Build the accounts vector
    let mut accounts = vec![
        AccountMeta::new(*authority, true),
        AccountMeta::new(*raffle_account, false),
        AccountMeta::new(*vrf_account, false),
        AccountMeta::new(*payer, true),
        AccountMeta::new_readonly(*switchboard_program, false),
        AccountMeta::new_readonly(*oracle_queue, false),
    ];
    
    // Add all remaining accounts needed for Switchboard
    accounts.extend_from_slice(remaining_accounts);

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

/// Create complete_raffle_with_vrf instruction
pub fn complete_raffle_with_vrf(
    program_id: &Pubkey,
    authority: &Pubkey,
    raffle_account: &Pubkey,
    vrf_account: &Pubkey,
    winner: &Pubkey,
    switchboard_program: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let data = RaffleInstruction::CompleteRaffleWithVrf {}.pack();

    let accounts = vec![
        AccountMeta::new(*authority, true),
        AccountMeta::new(*raffle_account, false),
        AccountMeta::new_readonly(*vrf_account, false),
        AccountMeta::new(*winner, false),
        AccountMeta::new_readonly(*switchboard_program, false),
        AccountMeta::new_readonly(clock::id(), false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

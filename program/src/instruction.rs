// Pot of Green Raffle Program - Instructions
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::program_error::ProgramError;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum RaffleInstruction {
    /// Initialize a new raffle
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority account creating the raffle
    /// 1. `[writable]` The raffle account
    /// 2. `[]` System program
    InitializeRaffle {
        /// Duration type (1: 1 hour, 2: 1 day, 3: 1 week, 4: 1 month)
        raffle_type: u8,
    },

    /// Enter a raffle
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The user entering the raffle
    /// 1. `[writable]` The raffle account
    /// 2. `[writable]` The treasury account
    /// 3. `[writable]` The utility account
    /// 4. `[]` System program
    EnterRaffle {
        /// Amount of SOL to enter (minimum 0.1)
        amount: u64,
    },

    /// Complete a raffle and select a winner
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The program authority
    /// 1. `[writable]` The raffle account
    /// 2. `[]` Recent blockhashes (for randomness)
    CompleteRaffle {},

    /// Claim raffle winnings
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The winner claiming the prize
    /// 1. `[writable]` The raffle account
    /// 2. `[writable]` The winner's SOL account
    ClaimPrize {
        /// Raffle ID to claim from
        raffle_id: u64,
    },

    /// Distribute revenue to token holders
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The program authority
    /// 1. `[writable]` The utility account
    /// 2. `[writable]` Token holder accounts (multiple)
    DistributeRevenue {},
}

impl RaffleInstruction {
    /// Unpacks a byte buffer into a RaffleInstruction
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (tag, rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;
        Ok(match tag {
            0 => Self::InitializeRaffle {
                raffle_type: rest[0],
            },
            1 => {
                let amount = rest
                    .get(..8)
                    .and_then(|slice| slice.try_into().ok())
                    .map(u64::from_le_bytes)
                    .ok_or(ProgramError::InvalidInstructionData)?;
                Self::EnterRaffle { amount }
            }
            2 => Self::CompleteRaffle {},
            3 => {
                let raffle_id = rest
                    .get(..8)
                    .and_then(|slice| slice.try_into().ok())
                    .map(u64::from_le_bytes)
                    .ok_or(ProgramError::InvalidInstructionData)?;
                Self::ClaimPrize { raffle_id }
            }
            4 => Self::DistributeRevenue {},
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }
}

// Pot of Green Raffle Program - Errors
use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum RaffleError {
    #[error("Invalid instruction")]
    InvalidInstruction,
    
    #[error("Raffle already initialized")]
    RaffleAlreadyInitialized,
    
    #[error("Raffle not initialized")]
    RaffleNotInitialized,
    
    #[error("Invalid raffle type")]
    InvalidRaffleType,
    
    #[error("Raffle not ended")]
    RaffleNotEnded,
    
    #[error("Raffle already ended")]
    RaffleAlreadyEnded,
    
    #[error("Entry amount too low")]
    EntryAmountTooLow,
    
    #[error("Not the winner")]
    NotTheWinner,
    
    #[error("Prize already claimed")]
    PrizeAlreadyClaimed,
    
    #[error("Insufficient funds")]
    InsufficientFunds,
    
    #[error("Invalid account owner")]
    InvalidAccountOwner,
    
    #[error("Utility threshold not reached")]
    UtilityThresholdNotReached,
}

impl From<RaffleError> for ProgramError {
    fn from(e: RaffleError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

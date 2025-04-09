use solana_program::{program_error::ProgramError, decode_error::DecodeError, msg, program_error::PrintProgramError};
use thiserror::Error;

/// Errors that may be returned by the Raffle program
#[derive(Error, Debug, Copy, Clone)]
pub enum RaffleError {
    /// Invalid instruction data passed
    #[error("Invalid instruction data")]
    InvalidInstructionData,
    
    /// Raffle is not active
    #[error("Raffle is not active")]
    RaffleNotActive,
    
    /// Raffle has already ended
    #[error("Raffle has already ended")]
    RaffleEnded,
    
    /// Raffle has not ended yet
    #[error("Raffle has not ended yet")]
    RaffleNotEnded,
    
    /// No tickets were sold
    #[error("No tickets were sold")]
    NoTicketsSold,
    
    /// Not enough tickets available
    #[error("Not enough tickets available")]
    InsufficientTickets,
    
    /// Insufficient funds for operation
    #[error("Insufficient funds for operation")]
    InsufficientFunds,
    
    /// Only the raffle authority can perform this action
    #[error("Only the raffle authority can perform this action")]
    NotRaffleAuthority,
    
    /// Raffle is not cancelled
    #[error("Raffle is not cancelled")]
    RaffleNotCancelled,
    
    /// Ticket purchase does not match
    #[error("Ticket purchase does not match raffle or purchaser")]
    TicketPurchaseMismatch,
}

impl From<RaffleError> for ProgramError {
    fn from(e: RaffleError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for RaffleError {
    fn type_of() -> &'static str {
        "Raffle Error"
    }
}

impl PrintProgramError for RaffleError {
    fn print<E>(&self) {
        msg!(&self.to_string());
    }
}

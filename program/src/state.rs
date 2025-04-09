// Pot of Green Raffle Program - State
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    clock::UnixTimestamp,
    program_pack::{IsInitialized, Sealed},
    pubkey::Pubkey,
};

/// Raffle types with their corresponding durations in seconds
pub enum RaffleType {
    OneHour = 3600,
    OneDay = 86400,
    OneWeek = 604800,
    OneMonth = 2592000,
}

impl From<u8> for RaffleType {
    fn from(value: u8) -> Self {
        match value {
            1 => RaffleType::OneHour,
            2 => RaffleType::OneDay,
            3 => RaffleType::OneWeek,
            4 => RaffleType::OneMonth,
            _ => RaffleType::OneHour, // Default to one hour if invalid
        }
    }
}

/// Raffle state
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Raffle {
    /// Is the raffle initialized
    pub is_initialized: bool,
    /// Unique raffle ID
    pub raffle_id: u64,
    /// Raffle type (1hr, 1day, 1wk, 1mo)
    pub raffle_type: u8,
    /// Start time of the raffle
    pub start_time: UnixTimestamp,
    /// End time of the raffle
    pub end_time: UnixTimestamp,
    /// Total amount in the raffle pool (after fees)
    pub pool_amount: u64,
    /// Number of entries in the raffle
    pub entry_count: u64,
    /// Winner of the raffle (if completed)
    pub winner: Option<Pubkey>,
    /// Whether the prize has been claimed
    pub prize_claimed: bool,
}

impl Sealed for Raffle {}

impl IsInitialized for Raffle {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Raffle {
    /// Create a new raffle
    pub fn new(raffle_id: u64, raffle_type: u8, start_time: UnixTimestamp) -> Self {
        let duration = match RaffleType::from(raffle_type) {
            RaffleType::OneHour => 3600,
            RaffleType::OneDay => 86400,
            RaffleType::OneWeek => 604800,
            RaffleType::OneMonth => 2592000,
        };
        
        Self {
            is_initialized: true,
            raffle_id,
            raffle_type,
            start_time,
            end_time: start_time + duration,
            pool_amount: 0,
            entry_count: 0,
            winner: None,
            prize_claimed: false,
        }
    }
    
    /// Check if the raffle has ended
    pub fn has_ended(&self, current_time: UnixTimestamp) -> bool {
        current_time >= self.end_time
    }
}

/// Entry in a raffle
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct RaffleEntry {
    /// Raffle ID this entry belongs to
    pub raffle_id: u64,
    /// User who made the entry
    pub user: Pubkey,
    /// Amount of SOL entered (after fees)
    pub amount: u64,
    /// Number of entries (1 entry per 0.1 SOL)
    pub entries: u64,
    /// Timestamp of the entry
    pub timestamp: UnixTimestamp,
}

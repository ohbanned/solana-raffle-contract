use solana_program::{
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
    clock::UnixTimestamp,
};
use arrayref::{array_ref, array_refs, mut_array_refs, array_mut_ref};
use std::convert::TryFrom;

/// Status of a raffle
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RaffleStatus {
    /// Raffle is open for entries
    Active,
    /// Raffle is complete and winner has been chosen
    Complete,
}

impl TryFrom<u8> for RaffleStatus {
    type Error = &'static str;

    fn try_from(val: u8) -> Result<Self, Self::Error> {
        match val {
            0 => Ok(RaffleStatus::Active),
            1 => Ok(RaffleStatus::Complete),
            _ => Err("Invalid raffle status"),
        }
    }
}

impl From<RaffleStatus> for u8 {
    fn from(status: RaffleStatus) -> Self {
        match status {
            RaffleStatus::Active => 0,
            RaffleStatus::Complete => 1,
        }
    }
}

/// Raffle account data
#[derive(Debug, Clone, Copy)]
pub struct Raffle {
    /// Is the account initialized
    pub is_initialized: bool,
    /// Creator of the raffle (but anyone can complete the raffle - fully decentralized)
    pub authority: Pubkey,
    /// Title of the raffle (max 32 chars)
    pub title: [u8; 32],
    /// End time of the raffle (Unix timestamp)
    pub end_time: UnixTimestamp,
    /// Price per ticket in lamports (1 SOL = 1,000,000,000 lamports)
    pub ticket_price: u64,
    /// Status of the raffle
    pub status: RaffleStatus,
    /// Winner of the raffle (zero if not completed)
    pub winner: Pubkey,
    /// Total tickets sold
    pub tickets_sold: u64,
    /// Fee percentage (in basis points, e.g. 1000 = 10%)
    pub fee_basis_points: u16,
    /// Treasury account to receive fees
    pub treasury: Pubkey,
    /// VRF account used for random winner selection
    pub vrf_account: Pubkey,
    /// Flag indicating if VRF request is in progress
    pub vrf_request_in_progress: bool,
}

/// Program configuration account
#[derive(Debug, Clone, Copy)]
pub struct Config {
    /// Is the account initialized
    pub is_initialized: bool,
    /// Admin authority that can update config
    pub admin: Pubkey,
    /// Treasury address that receives fees
    pub treasury: Pubkey,
    /// Fixed ticket price in lamports (0.025 SOL = 25,000,000 lamports)
    pub ticket_price: u64,
    /// Fee percentage in basis points (e.g., 500 = 5%)
    pub fee_basis_points: u16,
}

impl Default for Config {
    fn default() -> Self {
        // Hardcoded values for admin and treasury
        // Admin Address: ALUhG5kg3mje7LpX1uDCuconBh9ADNFYan1vzYLV54Au
        // Ticket Price: 0.025 SOL = 25,000,000 lamports
        // Fee: 10% = 1000 basis points
        
        // Correct bytes for ALUhG5kg3mje7LpX1uDCuconBh9ADNFYan1vzYLV54Au
        let admin_bytes = [138, 182, 136, 21, 23, 151, 163, 26, 122, 255, 174, 159, 169, 142, 30, 115, 28, 171, 155, 60, 15, 195, 103, 130, 203, 87, 100, 253, 237, 131, 212, 42];
        let treasury_bytes = [138, 182, 136, 21, 23, 151, 163, 26, 122, 255, 174, 159, 169, 142, 30, 115, 28, 171, 155, 60, 15, 195, 103, 130, 203, 87, 100, 253, 237, 131, 212, 42];

        Self {
            is_initialized: true,
            admin: Pubkey::new_from_array(admin_bytes),
            treasury: Pubkey::new_from_array(treasury_bytes),
            ticket_price: 25_000_000, // 0.025 SOL
            fee_basis_points: 1000,    // 10%
        }
    }
}

/// Ticket purchase record
#[derive(Debug, Clone, Copy)]
pub struct TicketPurchase {
    /// Is the account initialized
    pub is_initialized: bool,
    /// The raffle this ticket is for
    pub raffle: Pubkey,
    /// The purchaser of the ticket
    pub purchaser: Pubkey,
    /// Number of tickets purchased
    pub ticket_count: u64,
    /// Purchase time
    pub purchase_time: UnixTimestamp,
}

impl Sealed for Raffle {}
impl Sealed for Config {}
impl Sealed for TicketPurchase {}

impl IsInitialized for Raffle {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl IsInitialized for Config {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl IsInitialized for TicketPurchase {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for Raffle {
    const LEN: usize = 1 + 32 + 32 + 8 + 8 + 1 + 32 + 8 + 2 + 32 + 32 + 1;

    fn unpack_from_slice(src: &[u8]) -> Result<Self, solana_program::program_error::ProgramError> {
        let src = array_ref![src, 0, Raffle::LEN];
        let (
            is_initialized,
            authority,
            title,
            end_time,
            ticket_price,
            status,
            winner,
            tickets_sold,
            fee_basis_points,
            treasury,
            vrf_account,
            vrf_request_in_progress,
        ) = array_refs![src, 1, 32, 32, 8, 8, 1, 32, 8, 2, 32, 32, 1];

        Ok(Raffle {
            is_initialized: is_initialized[0] != 0,
            authority: Pubkey::new_from_array(*authority),
            title: *title,
            end_time: UnixTimestamp::from_le_bytes(*end_time),
            ticket_price: u64::from_le_bytes(*ticket_price),
            status: RaffleStatus::try_from(status[0]).map_err(|_| solana_program::program_error::ProgramError::InvalidAccountData)?,
            winner: Pubkey::new_from_array(*winner),
            tickets_sold: u64::from_le_bytes(*tickets_sold),
            fee_basis_points: u16::from_le_bytes(*fee_basis_points),
            treasury: Pubkey::new_from_array(*treasury),
            vrf_account: Pubkey::new_from_array(*vrf_account),
            vrf_request_in_progress: vrf_request_in_progress[0] != 0,
        })
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dst = array_mut_ref![dst, 0, Raffle::LEN];
        let (
            is_initialized_dst,
            authority_dst,
            title_dst,
            end_time_dst,
            ticket_price_dst,
            status_dst,
            winner_dst,
            tickets_sold_dst,
            fee_basis_points_dst,
            treasury_dst,
            vrf_account_dst,
            vrf_request_in_progress_dst,
        ) = mut_array_refs![dst, 1, 32, 32, 8, 8, 1, 32, 8, 2, 32, 32, 1];

        is_initialized_dst[0] = self.is_initialized as u8;
        authority_dst.copy_from_slice(self.authority.as_ref());
        title_dst.copy_from_slice(&self.title);
        *end_time_dst = self.end_time.to_le_bytes();
        *ticket_price_dst = self.ticket_price.to_le_bytes();
        status_dst[0] = self.status.into();
        winner_dst.copy_from_slice(self.winner.as_ref());
        *tickets_sold_dst = self.tickets_sold.to_le_bytes();
        *fee_basis_points_dst = self.fee_basis_points.to_le_bytes();
        treasury_dst.copy_from_slice(self.treasury.as_ref());
        vrf_account_dst.copy_from_slice(self.vrf_account.as_ref());
        vrf_request_in_progress_dst[0] = self.vrf_request_in_progress as u8;
    }
}

impl Pack for Config {
    const LEN: usize = 1 + 32 + 32 + 8 + 2;

    fn unpack_from_slice(src: &[u8]) -> Result<Self, solana_program::program_error::ProgramError> {
        let src = array_ref![src, 0, Config::LEN];
        let (is_initialized, admin, treasury, ticket_price, fee_basis_points) = array_refs![src, 1, 32, 32, 8, 2];

        Ok(Config {
            is_initialized: is_initialized[0] != 0,
            admin: Pubkey::new_from_array(*admin),
            treasury: Pubkey::new_from_array(*treasury),
            ticket_price: u64::from_le_bytes(*ticket_price),
            fee_basis_points: u16::from_le_bytes(*fee_basis_points),
        })
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dst = array_mut_ref![dst, 0, Config::LEN];
        let (is_initialized_dst, admin_dst, treasury_dst, ticket_price_dst, fee_basis_points_dst) = 
            mut_array_refs![dst, 1, 32, 32, 8, 2];

        is_initialized_dst[0] = self.is_initialized as u8;
        admin_dst.copy_from_slice(self.admin.as_ref());
        treasury_dst.copy_from_slice(self.treasury.as_ref());
        *ticket_price_dst = self.ticket_price.to_le_bytes();
        *fee_basis_points_dst = self.fee_basis_points.to_le_bytes();
    }
}

impl Pack for TicketPurchase {
    const LEN: usize = 1 + 32 + 32 + 8 + 8;

    fn unpack_from_slice(src: &[u8]) -> Result<Self, solana_program::program_error::ProgramError> {
        let src = array_ref![src, 0, TicketPurchase::LEN];
        let (is_initialized, raffle, purchaser, ticket_count, purchase_time) =
            array_refs![src, 1, 32, 32, 8, 8];

        Ok(TicketPurchase {
            is_initialized: is_initialized[0] != 0,
            raffle: Pubkey::new_from_array(*raffle),
            purchaser: Pubkey::new_from_array(*purchaser),
            ticket_count: u64::from_le_bytes(*ticket_count),
            purchase_time: UnixTimestamp::from_le_bytes(*purchase_time),
        })
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dst = array_mut_ref![dst, 0, TicketPurchase::LEN];
        let (is_initialized_dst, raffle_dst, purchaser_dst, ticket_count_dst, purchase_time_dst) =
            mut_array_refs![dst, 1, 32, 32, 8, 8];

        is_initialized_dst[0] = self.is_initialized as u8;
        raffle_dst.copy_from_slice(self.raffle.as_ref());
        purchaser_dst.copy_from_slice(self.purchaser.as_ref());
        *ticket_count_dst = self.ticket_count.to_le_bytes();
        *purchase_time_dst = self.purchase_time.to_le_bytes();
    }
}

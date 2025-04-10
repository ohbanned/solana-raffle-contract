// Pot of Green Raffle Program - Utility Functions
use solana_program::pubkey::Pubkey;

// Removed pseudo-random value generation in favor of VRF

/// Calculate fee amount based on input amount and basis points
pub fn calculate_fee(amount: u64, basis_points: u16) -> u64 {
    (amount * basis_points as u64) / 10000
}

/// Calculate number of entries based on SOL amount
pub fn calculate_entries(amount_lamports: u64) -> u64 {
    // 0.1 SOL = 1 entry
    amount_lamports / 100_000_000
}

/// Find a program derived address for a raffle
pub fn find_raffle_address(program_id: &Pubkey, raffle_id: u64) -> (Pubkey, u8) {
    let raffle_id_bytes = raffle_id.to_le_bytes();
    Pubkey::find_program_address(&[b"raffle", &raffle_id_bytes], program_id)
}

/// Find a program derived address for a raffle entry
pub fn find_entry_address(program_id: &Pubkey, raffle_id: u64, user: &Pubkey) -> (Pubkey, u8) {
    let raffle_id_bytes = raffle_id.to_le_bytes();
    Pubkey::find_program_address(&[b"entry", &raffle_id_bytes, user.as_ref()], program_id)
}

/// Convert lamports to SOL (for display purposes)
pub fn lamports_to_sol(lamports: u64) -> f64 {
    lamports as f64 / 1_000_000_000.0
}

/// Convert SOL to lamports
pub fn sol_to_lamports(sol: f64) -> u64 {
    (sol * 1_000_000_000.0) as u64
}

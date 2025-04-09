// SolCino Casino Platform
// A fully automated casino platform on Solana, starting with raffles

// Core modules
pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod utils;

// Raffle modules
pub mod raffle_state;
pub mod raffle_instruction;
pub mod raffle_processor;
pub mod raffle_entrypoint;
pub mod raffle_error;

// VRF module for randomness
pub mod vrf;

use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
};

// Program entrypoint
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    processor::process_instruction(program_id, accounts, instruction_data)
}

// SolCino Raffle Contract
// Full implementation with raffle functionality

use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
};

// Define a single program entrypoint - THE ONLY ENTRYPOINT IN THE CODEBASE
entrypoint!(process_instruction);

// Include all modules that make up the raffle contract
pub mod raffle_state;
pub mod raffle_instruction;
pub mod raffle_error;
pub mod vrf;
pub mod utils;
pub mod raffle_processor;

// Process instruction just delegates to the Processor's process method
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    raffle_processor::Processor::process(program_id, accounts, instruction_data)
}



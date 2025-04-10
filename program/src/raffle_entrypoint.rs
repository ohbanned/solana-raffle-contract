// Import what we need from Solana Program
use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
    msg,
};

// Import our simplified processor
use crate::simplified_processor::SimpleProcessor;

// Define the standard Solana entrypoint
entrypoint!(process_instruction);

// Process instruction handler
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Processing instruction for SolCino raffle program using simplified processor");
    SimpleProcessor::process(program_id, accounts, instruction_data)
}

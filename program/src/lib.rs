// SolCino Raffle Contract - Deployment Version

use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
};

// Define a single program entrypoint here (not in raffle_entrypoint.rs)
entrypoint!(process_instruction);

// Simple processor that logs inputs and always succeeds
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("SolCino Raffle - Minimal Deployment Version");
    
    // Log account info
    msg!("Number of accounts: {}", accounts.len());
    for (i, account) in accounts.iter().enumerate() {
        msg!("Account [{}]: {}", i, account.key);
    }
    
    // Log instruction data
    if !instruction_data.is_empty() {
        msg!("Instruction data (first byte): {}", instruction_data[0]);
        msg!("Instruction data length: {}", instruction_data.len());
    } else {
        msg!("No instruction data provided");
    }
    
    // Always succeed for minimal version
    msg!("Minimal processor completed successfully");
    Ok(())
}

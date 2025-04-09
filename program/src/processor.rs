// Pot of Green Raffle Program - Instruction Processor
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::{Sysvar, SysvarId},
};

use crate::{
    error::RaffleError,
    instruction::RaffleInstruction,
    state::{Raffle, RaffleEntry},
    utils,
};

// Fee constants
const FEE_PERCENTAGE: u8 = 10; // 10% fee
const UTILITY_SPLIT: u8 = 50; // 50% of fees go to utility
const MIN_ENTRY_AMOUNT: u64 = 100_000_000; // 0.1 SOL in lamports

/// Program state handler.
pub struct Processor {}

impl Processor {
    /// Process a Pot of Green Raffle instruction
    pub fn process_instruction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = RaffleInstruction::unpack(instruction_data)?;

        match instruction {
            RaffleInstruction::InitializeRaffle { raffle_type } => {
                Self::process_initialize_raffle(program_id, accounts, raffle_type)
            }
            RaffleInstruction::EnterRaffle { amount } => {
                Self::process_enter_raffle(program_id, accounts, amount)
            }
            RaffleInstruction::CompleteRaffle {} => {
                Self::process_complete_raffle(program_id, accounts)
            }
            RaffleInstruction::ClaimPrize { raffle_id } => {
                Self::process_claim_prize(program_id, accounts, raffle_id)
            }
            RaffleInstruction::DistributeRevenue {} => {
                Self::process_distribute_revenue(program_id, accounts)
            }
        }
    }

    /// Process InitializeRaffle instruction
    fn process_initialize_raffle(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        raffle_type: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get accounts
        let authority_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        
        // Verify authority is signer
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        // Verify raffle type is valid (1-4)
        if raffle_type < 1 || raffle_type > 4 {
            return Err(RaffleError::InvalidRaffleType.into());
        }
        
        // Get current time
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        // Generate unique raffle ID (using timestamp and raffle type)
        let raffle_id = (current_time as u64) * 10 + (raffle_type as u64);
        
        // Create new raffle
        let raffle = Raffle::new(raffle_id, raffle_type, current_time);
        
        // Serialize and save raffle data
        raffle.serialize(&mut *raffle_info.data.borrow_mut())?;
        
        msg!("Raffle initialized with ID: {}", raffle_id);
        Ok(())
    }

    /// Process EnterRaffle instruction
    fn process_enter_raffle(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get accounts
        let user_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let treasury_info = next_account_info(account_info_iter)?;
        let utility_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        
        // Verify user is signer
        if !user_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        // Check minimum entry amount
        if amount < MIN_ENTRY_AMOUNT {
            return Err(RaffleError::EntryAmountTooLow.into());
        }
        
        // Load raffle data
        let mut raffle = Raffle::try_from_slice(&raffle_info.data.borrow())?;
        
        // Verify raffle is initialized
        if !raffle.is_initialized {
            return Err(RaffleError::RaffleNotInitialized.into());
        }
        
        // Check if raffle has ended
        let clock = Clock::get()?;
        if raffle.has_ended(clock.unix_timestamp) {
            return Err(RaffleError::RaffleAlreadyEnded.into());
        }
        
        // Calculate fees
        let fee_amount = (amount * FEE_PERCENTAGE as u64) / 100;
        let utility_amount = (fee_amount * UTILITY_SPLIT as u64) / 100;
        let treasury_amount = fee_amount - utility_amount;
        let pool_amount = amount - fee_amount;
        
        // Transfer SOL from user to treasury
        invoke(
            &system_instruction::transfer(user_info.key, treasury_info.key, treasury_amount),
            &[user_info.clone(), treasury_info.clone(), system_program_info.clone()],
        )?;
        
        // Transfer SOL from user to utility
        invoke(
            &system_instruction::transfer(user_info.key, utility_info.key, utility_amount),
            &[user_info.clone(), utility_info.clone(), system_program_info.clone()],
        )?;
        
        // Transfer SOL from user to raffle pool
        invoke(
            &system_instruction::transfer(user_info.key, raffle_info.key, pool_amount),
            &[user_info.clone(), raffle_info.clone(), system_program_info.clone()],
        )?;
        
        // Update raffle state
        raffle.pool_amount = raffle.pool_amount.checked_add(pool_amount).unwrap();
        raffle.entry_count = raffle.entry_count.checked_add(1).unwrap();
        
        // Save updated raffle data
        raffle.serialize(&mut *raffle_info.data.borrow_mut())?;
        
        // Create entry record
        let entry = RaffleEntry {
            raffle_id: raffle.raffle_id,
            user: *user_info.key,
            amount: pool_amount,
            entries: pool_amount / (MIN_ENTRY_AMOUNT / 10), // 1 entry per 0.01 SOL
            timestamp: clock.unix_timestamp,
        };
        
        msg!("User entered raffle with {} SOL (after fees)", pool_amount as f64 / 1_000_000_000.0);
        Ok(())
    }

    /// Process CompleteRaffle instruction
    fn process_complete_raffle(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get accounts
        let authority_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let recent_blockhashes_info = next_account_info(account_info_iter)?;
        
        // Verify authority is signer
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        // Load raffle data
        let mut raffle = Raffle::try_from_slice(&raffle_info.data.borrow())?;
        
        // Verify raffle is initialized
        if !raffle.is_initialized {
            return Err(RaffleError::RaffleNotInitialized.into());
        }
        
        // Check if raffle has ended
        let clock = Clock::get()?;
        if !raffle.has_ended(clock.unix_timestamp) {
            return Err(RaffleError::RaffleNotEnded.into());
        }
        
        // Check if winner already selected
        if raffle.winner.is_some() {
            return Err(ProgramError::InvalidAccountData);
        }
        
        // Select winner using randomness from recent blockhashes
        // In a real implementation, you would use a more robust source of randomness
        // like Chainlink VRF or similar
        let random_bytes = recent_blockhashes_info.data.borrow();
        let random_value = utils::generate_random_value(&random_bytes, raffle.entry_count);
        
        // For this example, we're just using a placeholder winner
        // In a real implementation, you would select the winner based on entries
        let winner = Pubkey::new_unique(); // Placeholder
        
        // Update raffle with winner
        raffle.winner = Some(winner);
        
        // Save updated raffle data
        raffle.serialize(&mut *raffle_info.data.borrow_mut())?;
        
        msg!("Raffle completed. Winner selected!");
        
        // Initialize new raffle of the same type
        let new_raffle = Raffle::new(
            (clock.unix_timestamp as u64) * 10 + (raffle.raffle_type as u64),
            raffle.raffle_type,
            clock.unix_timestamp,
        );
        
        // Save new raffle data to a new account
        // In a real implementation, you would create a new account for this
        
        Ok(())
    }

    /// Process ClaimPrize instruction
    fn process_claim_prize(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        raffle_id: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get accounts
        let winner_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let winner_sol_account = next_account_info(account_info_iter)?;
        
        // Verify winner is signer
        if !winner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        // Load raffle data
        let mut raffle = Raffle::try_from_slice(&raffle_info.data.borrow())?;
        
        // Verify raffle is initialized and completed
        if !raffle.is_initialized {
            return Err(RaffleError::RaffleNotInitialized.into());
        }
        
        // Verify raffle ID matches
        if raffle.raffle_id != raffle_id {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Verify prize not already claimed
        if raffle.prize_claimed {
            return Err(RaffleError::PrizeAlreadyClaimed.into());
        }
        
        // Verify caller is the winner
        match raffle.winner {
            Some(winner) if winner == *winner_info.key => {}
            _ => return Err(RaffleError::NotTheWinner.into()),
        }
        
        // Transfer prize to winner
        // In a real implementation, you would use a PDA with proper signing
        
        // Mark prize as claimed
        raffle.prize_claimed = true;
        
        // Save updated raffle data
        raffle.serialize(&mut *raffle_info.data.borrow_mut())?;
        
        msg!("Prize claimed by winner!");
        Ok(())
    }

    /// Process DistributeRevenue instruction
    fn process_distribute_revenue(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        // Get accounts
        let authority_info = next_account_info(account_info_iter)?;
        let utility_info = next_account_info(account_info_iter)?;
        
        // Verify authority is signer
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        // Check utility balance
        let utility_balance = utility_info.lamports();
        
        // Define minimum threshold for distribution (e.g., 1 SOL)
        let min_threshold = 1_000_000_000;
        
        if utility_balance < min_threshold {
            return Err(RaffleError::UtilityThresholdNotReached.into());
        }
        
        // In a real implementation, you would:
        // 1. Get the top 100 token holders
        // 2. Calculate their share based on token holdings
        // 3. Transfer SOL to each holder
        
        msg!("Revenue distributed to token holders!");
        Ok(())
    }
}

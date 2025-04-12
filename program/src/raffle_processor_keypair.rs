use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    system_instruction,
    sysvar::{clock::Clock, rent::Rent, Sysvar},
};

use crate::{
    error::RaffleError,
    instruction::RaffleInstruction,
    state::{Config, Raffle, RaffleEntry, RaffleStatus},
    vrf::request_randomness,
};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = RaffleInstruction::unpack(instruction_data)?;

        match instruction {
            RaffleInstruction::InitializeConfig {
                ticket_price,
                fee_basis_points,
            } => {
                msg!("Instruction: Initialize Config");
                Self::process_initialize_config(accounts, ticket_price, fee_basis_points, program_id)
            }
            RaffleInstruction::InitializeRaffle { title, duration } => {
                msg!("Instruction: Initialize Raffle");
                Self::process_initialize_raffle(accounts, title, duration, program_id)
            }
            RaffleInstruction::PurchaseTickets { ticket_count } => {
                msg!("Instruction: Purchase Tickets");
                Self::process_purchase_tickets(accounts, ticket_count, program_id)
            }
            RaffleInstruction::CompleteRaffle => {
                msg!("Instruction: Complete Raffle");
                Self::process_complete_raffle(accounts, program_id)
            }
            RaffleInstruction::ClaimPrize => {
                msg!("Instruction: Claim Prize");
                Self::process_claim_prize(accounts, program_id)
            }
            RaffleInstruction::UpdateTicketPrice { ticket_price } => {
                msg!("Instruction: Update Ticket Price");
                Self::process_update_ticket_price(accounts, ticket_price, program_id)
            }
            RaffleInstruction::UpdateFee { fee_basis_points } => {
                msg!("Instruction: Update Fee");
                Self::process_update_fee(accounts, fee_basis_points, program_id)
            }
        }
    }

    /// Process the InitializeConfig instruction
    /// 
    /// This initializes the global configuration for the raffle program
    /// Only called once when the program is first deployed
    fn process_initialize_config(
        accounts: &[AccountInfo],
        ticket_price: u64,
        fee_basis_points: u16,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let admin_info = next_account_info(account_info_iter)?;
        let config_info = next_account_info(account_info_iter)?;
        let treasury_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        
        // Verify the admin signed the transaction
        if !admin_info.is_signer {
            msg!("Admin must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        // Find the PDA for the config account
        let (expected_config_pubkey, bump_seed) = Pubkey::find_program_address(
            &[b"config"],
            program_id,
        );

        // Verify that the provided config account is the expected PDA
        if *config_info.key != expected_config_pubkey {
            msg!("Invalid config account address");
            return Err(ProgramError::InvalidArgument);
        }
        
        // Check if we need to create the account (account doesn't exist yet)
        if config_info.owner != program_id {
            msg!("Creating new config account");
            // Get rent exemption amount
            let rent = Rent::get()?;
            let rent_lamports = rent.minimum_balance(Config::LEN);
            
            // Create the config account with the correct PDA
            invoke_signed(
                &solana_program::system_instruction::create_account(
                    admin_info.key,
                    config_info.key,
                    rent_lamports,
                    Config::LEN as u64,
                    program_id,
                ),
                &[admin_info.clone(), config_info.clone(), system_program_info.clone()],
                &[&[b"config", &[bump_seed]]],
            )?;
        } else if config_info.owner != program_id {
            // Account exists but is owned by another program
            msg!("Config account must be owned by this program");
            return Err(ProgramError::IncorrectProgramId);
        }
        
        // Check if the config is already initialized
        if let Ok(config) = Config::unpack(&config_info.data.borrow()) {
            if config.is_initialized {
                msg!("Config account is already initialized");
                return Err(ProgramError::AccountAlreadyInitialized);
            }
        }
        
        // Validate inputs
        if fee_basis_points > 10000 {
            msg!("Fee basis points cannot exceed 10000 (100%)");
            return Err(ProgramError::InvalidArgument);
        }
        
        // Initialize config data
        let config_data = Config {
            is_initialized: true,
            admin: *admin_info.key,
            treasury: *treasury_info.key,
            ticket_price,
            fee_basis_points,
        };
        
        // Save the config data
        Config::pack(config_data, &mut config_info.data.borrow_mut())?;
        
        msg!("Config initialized: Admin={}, Treasury={}, TicketPrice={}, Fee={}%",
            admin_info.key,
            treasury_info.key,
            ticket_price,
            fee_basis_points as f32 / 100.0);
            
        Ok(())
    }

    /// Process the InitializeRaffle instruction
    /// 
    /// Initializes a new raffle with the specified title and duration
    /// Modified to work with regular keypair-based accounts instead of PDAs
    fn process_initialize_raffle(
        accounts: &[AccountInfo],
        title: [u8; 32],
        duration: u64,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let config_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Ensure the authority signed the transaction
        if !authority_info.is_signer {
            msg!("Authority must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        // Get current time from the clock
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;
        
        // REMOVED: PDA derivation and validation
        // We now accept any account owned by the program
        
        // Check that the raffle account is owned by our program
        if raffle_info.owner != program_id {
            msg!("Raffle account must be owned by this program");
            return Err(ProgramError::IncorrectProgramId);
        }

        // Load config to get ticket price and fee information
        let config_data = Config::unpack(&config_info.data.borrow())?;

        // Validate config
        if !config_data.is_initialized {
            msg!("Config account must be initialized");
            return Err(ProgramError::InvalidAccountData);
        }

        // Calculate end time
        let end_time = current_time + duration as i64;

        // Initialize raffle data
        let raffle_data = Raffle {
            is_initialized: true,
            authority: *authority_info.key,
            title,
            end_time,
            ticket_price: config_data.ticket_price,  // Take ticket price from config
            status: RaffleStatus::Active,
            winner: Pubkey::default(),  // No winner initially
            tickets_sold: 0,
            fee_basis_points: config_data.fee_basis_points,  // Fixed fee from config
            treasury: config_data.treasury,  // Treasury from config
            vrf_account: Pubkey::default(),  // Will be set when VRF is requested
            vrf_request_in_progress: false,
        };

        // Save the raffle data
        Raffle::pack(raffle_data, &mut raffle_info.data.borrow_mut())?;

        msg!("Raffle initialized: End time={}, Price={}", end_time, config_data.ticket_price);
        Ok(())
    }

    /// Process the PurchaseTickets instruction
    fn process_purchase_tickets(
        accounts: &[AccountInfo],
        ticket_count: u64,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let config_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Ensure the buyer signed the transaction
        if !buyer_info.is_signer {
            msg!("Buyer must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Load raffle data
        let mut raffle_data = Raffle::unpack(&raffle_info.data.borrow())?;

        // Verify the raffle is initialized
        if !raffle_data.is_initialized {
            msg!("Raffle is not initialized");
            return Err(ProgramError::UninitializedAccount);
        }

        // Check that the raffle is still active
        if raffle_data.status != RaffleStatus::Active {
            msg!("Raffle is not active");
            return Err(RaffleError::RaffleNotActive.into());
        }

        // Get current time from the clock
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Check raffle hasn't ended
        if current_time >= raffle_data.end_time {
            msg!("Raffle has ended");
            return Err(RaffleError::RaffleEnded.into());
        }

        // Calculate the total cost for the tickets
        let ticket_price = raffle_data.ticket_price;
        let total_cost = ticket_price.checked_mul(ticket_count)
            .ok_or(RaffleError::ArithmeticError)?;

        // Transfer funds from buyer to raffle account
        invoke(
            &system_instruction::transfer(
                buyer_info.key,
                &raffle_data.treasury,
                total_cost,
            ),
            &[
                buyer_info.clone(),
                raffle_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Update raffle data
        raffle_data.tickets_sold = raffle_data.tickets_sold
            .checked_add(ticket_count)
            .ok_or(RaffleError::ArithmeticError)?;

        // Save updated raffle data
        Raffle::pack(raffle_data, &mut raffle_info.data.borrow_mut())?;

        msg!("Tickets purchased: {} by {}", ticket_count, buyer_info.key);
        Ok(())
    }

    /// Process the CompleteRaffle instruction
    fn process_complete_raffle(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let vrf_info = next_account_info(account_info_iter)?;
        let recent_blockhashes_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Only the raffle creator can complete it
        let mut raffle_data = Raffle::unpack(&raffle_info.data.borrow())?;
        
        // Verify the raffle is initialized
        if !raffle_data.is_initialized {
            msg!("Raffle is not initialized");
            return Err(ProgramError::UninitializedAccount);
        }

        // Check that the raffle is still active
        if raffle_data.status != RaffleStatus::Active {
            msg!("Raffle is not active");
            return Err(RaffleError::RaffleNotActive.into());
        }

        // Get current time
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Check that the raffle has ended
        if current_time < raffle_data.end_time {
            msg!("Raffle has not ended yet");
            return Err(RaffleError::RaffleNotEnded.into());
        }

        // Check if there are any tickets sold
        if raffle_data.tickets_sold == 0 {
            msg!("No tickets sold, raffle cannot be completed");
            return Err(RaffleError::NoTicketsSold.into());
        }

        // Request randomness from VRF if not already in progress
        if !raffle_data.vrf_request_in_progress {
            msg!("Requesting randomness...");
            
            // Store VRF account
            raffle_data.vrf_account = *vrf_info.key;
            raffle_data.vrf_request_in_progress = true;
            
            // Save updated raffle data
            Raffle::pack(raffle_data, &mut raffle_info.data.borrow_mut())?;
            
            // Request randomness from VRF
            request_randomness(
                program_id,
                raffle_info,
                vrf_info,
                recent_blockhashes_info,
                authority_info,
            )?;
            
            msg!("Randomness requested, raffle completion pending");
            return Ok(());
        }

        // TODO: Check if randomness is ready and set winner

        msg!("Raffle completed successfully");
        Ok(())
    }

    /// Process the ClaimPrize instruction
    fn process_claim_prize(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let winner_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // Load raffle data
        let mut raffle_data = Raffle::unpack(&raffle_info.data.borrow())?;

        // Verify the raffle is initialized
        if !raffle_data.is_initialized {
            msg!("Raffle is not initialized");
            return Err(ProgramError::UninitializedAccount);
        }

        // Check that the raffle is completed
        if raffle_data.status != RaffleStatus::Completed {
            msg!("Raffle is not completed");
            return Err(RaffleError::RaffleNotCompleted.into());
        }

        // Check that the winner is calling this instruction
        if raffle_data.winner != *winner_info.key {
            msg!("Only the winner can claim the prize");
            return Err(RaffleError::NotWinner.into());
        }

        // Check if prize has already been claimed
        if raffle_data.prize_claimed {
            msg!("Prize has already been claimed");
            return Err(RaffleError::PrizeAlreadyClaimed.into());
        }

        // Calculate prize amount (ticket_price * tickets_sold - fees)
        let total_pool = raffle_data.ticket_price
            .checked_mul(raffle_data.tickets_sold)
            .ok_or(RaffleError::ArithmeticError)?;
        
        let fee_percentage = raffle_data.fee_basis_points as u64;
        let fee_amount = total_pool
            .checked_mul(fee_percentage)
            .ok_or(RaffleError::ArithmeticError)?
            .checked_div(10000)
            .ok_or(RaffleError::ArithmeticError)?;
        
        let prize_amount = total_pool
            .checked_sub(fee_amount)
            .ok_or(RaffleError::ArithmeticError)?;

        // Transfer prize to winner
        // TODO: Implement prize transfer logic

        // Mark prize as claimed
        raffle_data.prize_claimed = true;

        // Save updated raffle data
        Raffle::pack(raffle_data, &mut raffle_info.data.borrow_mut())?;

        msg!("Prize claimed by winner: {}", winner_info.key);
        Ok(())
    }

    /// Process the UpdateTicketPrice instruction
    fn process_update_ticket_price(
        accounts: &[AccountInfo],
        ticket_price: u64,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let admin_info = next_account_info(account_info_iter)?;
        let config_info = next_account_info(account_info_iter)?;

        // Verify the admin signed the transaction
        if !admin_info.is_signer {
            msg!("Admin must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Load config data
        let mut config_data = Config::unpack(&config_info.data.borrow())?;

        // Verify config is initialized
        if !config_data.is_initialized {
            msg!("Config is not initialized");
            return Err(ProgramError::UninitializedAccount);
        }

        // Check that the admin is the one updating the ticket price
        if config_data.admin != *admin_info.key {
            msg!("Only the admin can update the ticket price");
            return Err(ProgramError::InvalidAccountData);
        }

        // Update ticket price
        config_data.ticket_price = ticket_price;

        // Save updated config data
        Config::pack(config_data, &mut config_info.data.borrow_mut())?;

        msg!("Ticket price updated to: {}", ticket_price);
        Ok(())
    }

    /// Process the UpdateFee instruction
    fn process_update_fee(
        accounts: &[AccountInfo],
        fee_basis_points: u16,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let admin_info = next_account_info(account_info_iter)?;
        let config_info = next_account_info(account_info_iter)?;

        // Verify the admin signed the transaction
        if !admin_info.is_signer {
            msg!("Admin must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Validate inputs
        if fee_basis_points > 10000 {
            msg!("Fee basis points cannot exceed 10000 (100%)");
            return Err(ProgramError::InvalidArgument);
        }

        // Load config data
        let mut config_data = Config::unpack(&config_info.data.borrow())?;

        // Verify config is initialized
        if !config_data.is_initialized {
            msg!("Config is not initialized");
            return Err(ProgramError::UninitializedAccount);
        }

        // Check that the admin is the one updating the fee
        if config_data.admin != *admin_info.key {
            msg!("Only the admin can update the fee");
            return Err(ProgramError::InvalidAccountData);
        }

        // Update fee
        config_data.fee_basis_points = fee_basis_points;

        // Save updated config data
        Config::pack(config_data, &mut config_info.data.borrow_mut())?;

        msg!("Fee updated to: {}%", fee_basis_points as f32 / 100.0);
        Ok(())
    }
}

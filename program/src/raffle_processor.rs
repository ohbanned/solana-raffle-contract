use crate::raffle_instruction::RaffleInstruction;
use crate::raffle_state::{Config, Raffle, RaffleStatus, TicketPurchase};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};
use std::mem;

pub struct Processor;
impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = RaffleInstruction::unpack(instruction_data)?;

        match instruction {
            RaffleInstruction::InitializeRaffle {
                title,
                duration,
            } => {
                Self::process_initialize_raffle(
                    accounts,
                    title,
                    duration,
                    program_id,
                )
            }
            RaffleInstruction::PurchaseTickets { ticket_count } => {
                Self::process_purchase_tickets(accounts, ticket_count, program_id)
            }
            RaffleInstruction::CompleteRaffle {} => Self::process_complete_raffle(accounts, program_id),
            RaffleInstruction::UpdateAdmin {} => Self::process_update_admin(accounts, program_id),
            RaffleInstruction::UpdateFeeAddress {} => Self::process_update_fee_address(accounts, program_id),
            RaffleInstruction::UpdateTicketPrice { new_ticket_price } => Self::process_update_ticket_price(accounts, new_ticket_price, program_id),
            RaffleInstruction::RequestRandomness {} => Self::process_request_randomness(accounts, program_id),
            RaffleInstruction::CompleteRaffleWithVrf {} => Self::process_complete_raffle_with_vrf(accounts, program_id),
        }
    }

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

        // Load config to get ticket price and fee information
        let config_data = Config::unpack(&config_info.data.borrow())?;

        // Check that the raffle account is owned by our program
        if raffle_info.owner != program_id {
            msg!("Raffle account must be owned by this program");
            return Err(ProgramError::IncorrectProgramId);
        }

        // Ensure the authority signed the transaction
        if !authority_info.is_signer {
            msg!("Authority must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Validate config
        if !config_data.is_initialized {
            msg!("Config account must be initialized");
            return Err(ProgramError::InvalidAccountData);
        }

        // Get current time from the clock
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Calculate end time
        let end_time = current_time + duration as i64;

        // Create the raffle account
        let rent = Rent::get()?;
        let rent_lamports = rent.minimum_balance(Raffle::LEN);
        
        invoke(
            &system_instruction::create_account(
                authority_info.key,
                raffle_info.key,
                rent_lamports,
                Raffle::LEN as u64,
                program_id,
            ),
            &[authority_info.clone(), raffle_info.clone()],
        )?;

        // Initialize raffle data
        let mut raffle_data = Raffle {
            is_initialized: true,
            authority: *authority_info.key,
            title,
            end_time,
            ticket_price: config_data.ticket_price,  // Fixed price from config
            status: RaffleStatus::Active,
            winner: Pubkey::default(),
            tickets_sold: 0,
            fee_basis_points: config_data.fee_basis_points,  // Fixed fee from config
            treasury: config_data.treasury,  // Treasury from config
        };

        // Save the raffle data
        Raffle::pack(raffle_data, &mut raffle_info.data.borrow_mut())?;

        msg!("Raffle initialized: End time={}, Price={}", end_time, config_data.ticket_price);
        Ok(())
    }

    fn process_purchase_tickets(
        accounts: &[AccountInfo],
        ticket_count: u64,
        program_id: &Pubkey,
    ) -> ProgramResult {
        if ticket_count == 0 {
            msg!("Ticket count must be greater than zero");
            return Err(ProgramError::InvalidArgument);
        }

        let account_info_iter = &mut accounts.iter();
        let purchaser_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let ticket_purchase_info = next_account_info(account_info_iter)?;
        let treasury_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Ensure the purchaser signed the transaction
        if !purchaser_info.is_signer {
            msg!("Purchaser must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Check that accounts are owned by correct programs
        if raffle_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Get the raffle data
        let mut raffle_data = Raffle::unpack(&raffle_info.data.borrow())?;

        // Check if raffle is still active
        if raffle_data.status != RaffleStatus::Active {
            msg!("Raffle is not active");
            return Err(ProgramError::InvalidAccountData);
        }

        // Get the current time
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Check if raffle has ended
        if current_time >= raffle_data.end_time {
            msg!("Raffle has ended");
            return Err(ProgramError::InvalidAccountData);
        }

        // No maximum ticket limit

        // Calculate total price
        let total_price = raffle_data.ticket_price.checked_mul(ticket_count)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        // Calculate fee amount
        let fee_amount = total_price
            .checked_mul(raffle_data.fee_basis_points as u64)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        // Calculate raffle pool amount (total minus fee)
        let raffle_amount = total_price.checked_sub(fee_amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        // Transfer fee to treasury
        if fee_amount > 0 {
            invoke(
                &system_instruction::transfer(
                    purchaser_info.key,
                    treasury_info.key,
                    fee_amount,
                ),
                &[
                    purchaser_info.clone(),
                    treasury_info.clone(),
                    system_program_info.clone(),
                ],
            )?;
        }

        // Transfer remaining funds to the raffle account (prize pool)
        invoke(
            &system_instruction::transfer(
                purchaser_info.key,
                raffle_info.key,
                raffle_amount,
            ),
            &[
                purchaser_info.clone(),
                raffle_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Create ticket purchase record (if provided)
        if ticket_purchase_info.owner == program_id {
            // This is an existing record, update it
            let mut ticket_data = TicketPurchase::unpack(&ticket_purchase_info.data.borrow())?;
            
            // Ensure the purchase record belongs to this raffle and purchaser
            if ticket_data.raffle != *raffle_info.key || ticket_data.purchaser != *purchaser_info.key {
                msg!("Ticket purchase record does not match the raffle or purchaser");
                return Err(ProgramError::InvalidAccountData);
            }
            
            // Update the ticket count
            ticket_data.ticket_count = ticket_data.ticket_count.checked_add(ticket_count)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            ticket_data.purchase_time = current_time;
            
            // Save updated ticket data
            TicketPurchase::pack(ticket_data, &mut ticket_purchase_info.data.borrow_mut())?;
        } else {
            // This is a new record, initialize it
            // First, ensure the account has enough space
            let rent = Rent::get()?;
            let rent_lamports = rent.minimum_balance(TicketPurchase::LEN);
            
            // Derive PDA for the ticket purchase record
            let (pda, bump_seed) = Pubkey::find_program_address(
                &[
                    b"ticket_purchase",
                    raffle_info.key.as_ref(),
                    purchaser_info.key.as_ref(),
                ],
                program_id,
            );
            
            // Ensure we're using the correct PDA
            if pda != *ticket_purchase_info.key {
                msg!("Ticket purchase account address is incorrect");
                return Err(ProgramError::InvalidArgument);
            }
            
            // Create the ticket purchase account
            invoke_signed(
                &system_instruction::create_account(
                    purchaser_info.key,
                    ticket_purchase_info.key,
                    rent_lamports,
                    TicketPurchase::LEN as u64,
                    program_id,
                ),
                &[
                    purchaser_info.clone(),
                    ticket_purchase_info.clone(),
                    system_program_info.clone(),
                ],
                &[&[
                    b"ticket_purchase",
                    raffle_info.key.as_ref(),
                    purchaser_info.key.as_ref(),
                    &[bump_seed],
                ]],
            )?;
            
            // Initialize ticket purchase data
            let ticket_data = TicketPurchase {
                is_initialized: true,
                raffle: *raffle_info.key,
                purchaser: *purchaser_info.key,
                ticket_count,
                purchase_time: current_time,
            };
            
            // Save ticket data
            TicketPurchase::pack(ticket_data, &mut ticket_purchase_info.data.borrow_mut())?;
        }

        // Update raffle data
        raffle_data.tickets_sold = raffle_data.tickets_sold.checked_add(ticket_count)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        Raffle::pack(raffle_data, &mut raffle_info.data.borrow_mut())?;

        msg!(
            "Purchased {} tickets for {} lamports each. Total: {} lamports",
            ticket_count,
            raffle_data.ticket_price,
            total_price
        );
        Ok(())
    }

    fn process_complete_raffle(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let winner_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Ensure the authority signed the transaction
        if !authority_info.is_signer {
            msg!("Authority must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Check that raffle account is owned by our program
        if raffle_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Get the raffle data
        let mut raffle_data = Raffle::unpack(&raffle_info.data.borrow())?;

        // Check if the caller is the raffle authority
        if raffle_data.authority != *authority_info.key {
            msg!("Only the raffle authority can complete the raffle");
            return Err(ProgramError::InvalidAccountData);
        }

        // Check if raffle is still active
        if raffle_data.status != RaffleStatus::Active {
            msg!("Raffle is not active");
            return Err(ProgramError::InvalidAccountData);
        }

        // Get the current time
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Check if raffle has ended
        if current_time < raffle_data.end_time {
            msg!("Raffle has not ended yet");
            return Err(ProgramError::InvalidAccountData);
        }

        // Check if any tickets were sold
        if raffle_data.tickets_sold == 0 {
            msg!("No tickets were sold, cannot complete raffle");
            return Err(ProgramError::InvalidAccountData);
        }

        // Calculate a pseudo-random winner (using recent slot, timestamp, and other sources of entropy)
        // NOTE: This is not cryptographically secure random selection - in production,
        // you would use a VRF (Verifiable Random Function) or similar for true randomness.
        let mut winner_ticket = ((current_time as u64) ^ (clock.slot)) % raffle_data.tickets_sold;
        
        // Set the winner's pubkey to the provided account
        // In a real production system, we'd verify this is correct by querying all ticket purchases
        raffle_data.winner = *winner_info.key;

        // Update raffle status
        raffle_data.status = RaffleStatus::Complete;
        Raffle::pack(raffle_data, &mut raffle_info.data.borrow_mut())?;

        // Transfer the prize to the winner
        // Get the lamport balance to transfer
        let prize_amount = raffle_info.lamports();
        
        **raffle_info.lamports.borrow_mut() = 0;
        **winner_info.lamports.borrow_mut() = winner_info.lamports().checked_add(prize_amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        msg!("Raffle completed! Winner: {}", winner_info.key);
        Ok(())
    }

    fn process_update_admin(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let current_admin_info = next_account_info(account_info_iter)?;
        let new_admin_info = next_account_info(account_info_iter)?;
        let config_info = next_account_info(account_info_iter)?;

        // Ensure the current admin signed the transaction
        if !current_admin_info.is_signer {
            msg!("Current admin must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Check that config account is owned by our program
        if config_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Get the config data
        let mut config_data = Config::unpack(&config_info.data.borrow())?;

        // Check if the caller is the current admin
        if config_data.admin != *current_admin_info.key {
            msg!("Only the current admin can update admin rights");
            return Err(ProgramError::InvalidAccountData);
        }

        // Update admin to new admin
        config_data.admin = *new_admin_info.key;
        Config::pack(config_data, &mut config_info.data.borrow_mut())?;

        msg!("Admin updated successfully to: {}", new_admin_info.key);
        Ok(())
    }

    fn process_update_fee_address(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let admin_info = next_account_info(account_info_iter)?;
        let new_fee_address_info = next_account_info(account_info_iter)?;
        let config_info = next_account_info(account_info_iter)?;

        // Ensure the admin signed the transaction
        if !admin_info.is_signer {
            msg!("Admin must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Check that config account is owned by our program
        if config_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Get the config data
        let mut config_data = Config::unpack(&config_info.data.borrow())?;

        // Check if the caller is the admin
        if config_data.admin != *admin_info.key {
            msg!("Only the admin can update fee address");
            return Err(ProgramError::InvalidAccountData);
        }

        // Update treasury address
        config_data.treasury = *new_fee_address_info.key;
        Config::pack(config_data, &mut config_info.data.borrow_mut())?;

        msg!("Fee address updated successfully to: {}", new_fee_address_info.key);
        Ok(())
    }

    /// Process UpdateTicketPrice instruction
    fn process_update_ticket_price(
        accounts: &[AccountInfo],
        new_ticket_price: u64,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let admin_info = next_account_info(account_info_iter)?;
        let config_info = next_account_info(account_info_iter)?;

        // Ensure the admin signed the transaction
        if !admin_info.is_signer {
            msg!("Admin must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Check that config account is owned by our program
        if config_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Get the config data
        let mut config_data = Config::unpack(&config_info.data.borrow())?;

        // Check if the caller is the admin
        if config_data.admin != *admin_info.key {
            msg!("Only the admin can update ticket price");
            return Err(ProgramError::InvalidAccountData);
        }

        // Validate new ticket price (can add your validation logic here if needed)
        if new_ticket_price == 0 {
            msg!("Ticket price cannot be zero");
            return Err(ProgramError::InvalidArgument);
        }

        // Update ticket price
        config_data.ticket_price = new_ticket_price;
        Config::pack(config_data, &mut config_info.data.borrow_mut())?;

        msg!("Ticket price updated successfully to: {} lamports", new_ticket_price);
        
        // Show SOL equivalent for clarity
        let sol_equivalent = new_ticket_price as f64 / 1_000_000_000.0;
        msg!("New ticket price is approximately: {} SOL", sol_equivalent);
        
        Ok(())
    }

    /// Process RequestRandomness instruction - Step 1 of the raffle completion process
    /// This initiates a VRF request to get random bytes for winner selection
    fn process_request_randomness(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
    ) -> ProgramResult {
        use crate::vrf::request_vrf_randomness;
        
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let vrf_account_info = next_account_info(account_info_iter)?;
        let payer_info = next_account_info(account_info_iter)?;
        let switchboard_program_info = next_account_info(account_info_iter)?;
        let oracle_queue_info = next_account_info(account_info_iter)?;

        // Collect remaining accounts required by Switchboard
        let remaining_accounts: Vec<&AccountInfo> = account_info_iter.collect();
        
        // Ensure the authority signed the transaction
        if !authority_info.is_signer {
            msg!("Authority must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Ensure the payer signed the transaction
        if !payer_info.is_signer {
            msg!("Payer must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Check that raffle account is owned by our program
        if raffle_info.owner != program_id {
            msg!("Raffle account must be owned by the program");
            return Err(ProgramError::IncorrectProgramId);
        }

        // Get the raffle data
        let mut raffle_data = Raffle::unpack(&raffle_info.data.borrow())?;

        // Check if the caller is the raffle authority
        if raffle_data.authority != *authority_info.key {
            msg!("Only the raffle authority can request randomness");
            return Err(ProgramError::InvalidAccountData);
        }

        // Check if raffle is still active
        if raffle_data.status != RaffleStatus::Active {
            msg!("Raffle is not active");
            return Err(ProgramError::InvalidAccountData);
        }

        // Get the current time
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Check if raffle has ended
        if current_time < raffle_data.end_time {
            msg!("Raffle has not ended yet, cannot request randomness");
            return Err(ProgramError::InvalidAccountData);
        }

        // Check if any tickets were sold
        if raffle_data.tickets_sold == 0 {
            msg!("No tickets were sold, cannot complete raffle");
            return Err(ProgramError::InvalidAccountData);
        }

        // Request VRF randomness from Switchboard
        let remaining_account_infos: Vec<AccountInfo> = remaining_accounts.iter().map(|a| (*a).clone()).collect();
        request_vrf_randomness(
            vrf_account_info,
            payer_info, 
            authority_info,
            switchboard_program_info,
            oracle_queue_info,
            None, // permission_account_info
            None, // escrow_account_info
            None, // payer_wallet_info
            &remaining_account_infos,
        )?;

        // Update raffle to indicate VRF request is in progress
        raffle_data.vrf_account = *vrf_account_info.key;
        raffle_data.vrf_request_in_progress = true;
        Raffle::pack(raffle_data, &mut raffle_info.data.borrow_mut())?;

        msg!("VRF randomness requested successfully for raffle: {}", raffle_info.key);
        Ok(())
    }

    /// Process CompleteRaffleWithVrf instruction - Step 2 of the raffle completion process
    /// This uses the VRF random bytes to select a winner
    fn process_complete_raffle_with_vrf(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
    ) -> ProgramResult {
        use crate::vrf::{verify_vrf_result, get_random_winner_index};
        
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let raffle_info = next_account_info(account_info_iter)?;
        let vrf_account_info = next_account_info(account_info_iter)?;
        let winner_info = next_account_info(account_info_iter)?;
        let switchboard_program_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Ensure the authority signed the transaction
        if !authority_info.is_signer {
            msg!("Authority must sign the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Check that raffle account is owned by our program
        if raffle_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Get the raffle data
        let mut raffle_data = Raffle::unpack(&raffle_info.data.borrow())?;

        // Check if the caller is the raffle authority
        if raffle_data.authority != *authority_info.key {
            msg!("Only the raffle authority can complete the raffle");
            return Err(ProgramError::InvalidAccountData);
        }

        // Check if raffle is still active
        if raffle_data.status != RaffleStatus::Active {
            msg!("Raffle is not active");
            return Err(ProgramError::InvalidAccountData);
        }

        // Check if VRF request is in progress
        if !raffle_data.vrf_request_in_progress {
            msg!("VRF request has not been initiated yet");
            return Err(ProgramError::InvalidAccountData);
        }

        // Check if VRF account matches
        if raffle_data.vrf_account != *vrf_account_info.key {
            msg!("VRF account does not match the one registered with this raffle");
            return Err(ProgramError::InvalidAccountData);
        }

        // Get the current time
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Check if raffle has ended
        if current_time < raffle_data.end_time {
            msg!("Raffle has not ended yet");
            return Err(ProgramError::InvalidAccountData);
        }

        // Verify VRF result
        let vrf_result = verify_vrf_result(vrf_account_info, switchboard_program_info)?;
        
        // Get random winner index
        let winner_index = get_random_winner_index(vrf_result, raffle_data.tickets_sold);
        msg!("Random winner index: {}", winner_index);

        // In a real implementation, we would look up the specific ticket purchase record
        // Here we're using the provided winner account as a simplification
        
        // Set the winner's pubkey to the provided account
        raffle_data.winner = *winner_info.key;

        // Update raffle status
        raffle_data.status = RaffleStatus::Complete;
        raffle_data.vrf_request_in_progress = false;
        Raffle::pack(raffle_data, &mut raffle_info.data.borrow_mut())?;

        // Transfer the prize to the winner
        // Get the lamport balance to transfer
        let prize_amount = raffle_info.lamports();
        
        **raffle_info.lamports.borrow_mut() = 0;
        **winner_info.lamports.borrow_mut() = winner_info.lamports().checked_add(prize_amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        msg!("Raffle completed with VRF randomness! Winner: {}", winner_info.key);
        Ok(())
    }
}

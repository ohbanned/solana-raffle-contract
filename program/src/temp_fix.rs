use crate::raffle_instruction::RaffleInstruction;
use crate::raffle_state::{Config, Raffle, RaffleStatus, TicketPurchase};
use crate::raffle_error::RaffleError;
use crate::vrf;

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    system_instruction,
    system_program,
    sysvar::{clock::Clock, rent::Rent, Sysvar},
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
            RaffleInstruction::CompleteRaffle {} => {
                msg!("Instruction: Complete Raffle");
                Self::process_complete_raffle(accounts, program_id)
            }
            RaffleInstruction::UpdateAdmin {} => {
                msg!("Instruction: Update Admin");
                Self::process_update_admin(accounts, program_id)
            }
            RaffleInstruction::UpdateFeeAddress {} => {
                msg!("Instruction: Update Fee Address");
                Self::process_update_fee_address(accounts, program_id)
            }
            RaffleInstruction::UpdateTicketPrice { new_ticket_price } => {
                msg!("Instruction: Update Ticket Price");
                Self::process_update_ticket_price(accounts, new_ticket_price, program_id)
            }
            RaffleInstruction::UpdateFeePercentage { new_fee_basis_points } => {
                msg!("Instruction: Update Fee Percentage");
                Self::process_update_fee_percentage(accounts, new_fee_basis_points, program_id)
            }
            RaffleInstruction::RequestRandomness {} => {
                msg!("Instruction: Request Randomness");
                Self::process_request_randomness(accounts, program_id)
            },
            RaffleInstruction::CompleteRaffleWithVrf {} => {
                msg!("Instruction: Complete Raffle With VRF");
                Self::process_complete_raffle_with_vrf(accounts, program_id)
            },
        }
    }

// Switchboard VRF integration for Pot of Green raffle program
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use switchboard_v2::{
    VrfAccountData, 
    VrfRequestRandomness, 
    SbState, 
    OracleQueueAccountData,
    SWITCHBOARD_PROGRAM_ID
};

pub struct VrfClientState {
    pub vrf_account: Pubkey,
    pub vrf_request_counter: u64,
    pub result_buffer: [u8; 32],
}

// Verify that a VRF result is ready and valid
pub fn verify_vrf_result<'a>(
    vrf_account_info: &AccountInfo<'a>,
    switchboard_program: &AccountInfo<'a>,
) -> Result<[u8; 32], ProgramError> {
    // Check that the VRF account is owned by Switchboard
    if vrf_account_info.owner != &SWITCHBOARD_PROGRAM_ID {
        msg!("VRF account not owned by Switchboard program");
        return Err(ProgramError::InvalidAccountOwner);
    }

    // Parse and verify VRF account data
    let vrf_account = VrfAccountData::new(vrf_account_info)?;
    
    // Check if the VRF has a valid result
    if !vrf_account.has_result()? {
        msg!("VRF account does not have a valid result");
        return Err(ProgramError::InvalidAccountData);
    }

    // Get the VRF result
    let result_buffer = vrf_account.get_result()?;
    let mut result = [0u8; 32];
    result.copy_from_slice(&result_buffer);
    
    Ok(result)
}

// Request a new VRF randomness for a raffle
pub fn request_vrf_randomness<'a>(
    vrf_account_info: &AccountInfo<'a>,
    payer_account_info: &AccountInfo<'a>, 
    authority_account_info: &AccountInfo<'a>,
    switchboard_program: &AccountInfo<'a>,
    oracle_queue_info: &AccountInfo<'a>,
    permission_account_info: Option<&AccountInfo<'a>>,
    escrow_account_info: Option<&AccountInfo<'a>>,
    payer_wallet_info: Option<&AccountInfo<'a>>,
    remaining_accounts: &[AccountInfo<'a>],
) -> ProgramResult {
    // Verify necessary accounts are provided
    if !payer_account_info.is_signer {
        msg!("Payer account must be a signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    if !authority_account_info.is_signer {
        msg!("Authority account must be a signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify the VRF account is owned by Switchboard
    if vrf_account_info.owner != &SWITCHBOARD_PROGRAM_ID {
        msg!("VRF account not owned by Switchboard program");
        return Err(ProgramError::InvalidAccountOwner);
    }

    // Parse the oracle queue account
    let oracle_queue = OracleQueueAccountData::new(oracle_queue_info)?;
    if oracle_queue.authority != authority_account_info.key.clone() {
        msg!("Oracle queue authority does not match authority provided");
        return Err(ProgramError::InvalidArgument);
    }

    // Request randomness from the VRF account
    let vrf_request_randomness = VrfRequestRandomness {
        authority: authority_account_info.clone(),
        vrf: vrf_account_info.clone(),
        oracle_queue: oracle_queue_info.clone(),
        queue_authority: authority_account_info.clone(),
        data_buffer: oracle_queue.data_buffer,
        permission: permission_account_info.cloned(),
        escrow: escrow_account_info.cloned(),
        payer_wallet: payer_wallet_info.cloned(),
        payer: payer_account_info.clone(),
        recent_blockhashes: recent_blockhashes_sysvar::id(),
        program_state: SbState::get_state_address(),
        token_program: spl_token::id(),
    };

    // Execute the request
    vrf_request_randomness.invoke_signed(
        switchboard_program, 
        remaining_accounts, 
        &[]
    )?;

    msg!("VRF randomness request submitted successfully");
    Ok(())
}

// Get a random winner index from VRF result
pub fn get_random_winner_index(vrf_result: [u8; 32], total_tickets: u64) -> u64 {
    if total_tickets == 0 {
        return 0;
    }

    // Convert first 8 bytes of VRF result to u64
    let random_bytes = &vrf_result[0..8];
    let mut random_value = 0u64;
    for (i, byte) in random_bytes.iter().enumerate() {
        random_value |= (*byte as u64) << (8 * i);
    }

    // Get random index based on ticket count
    random_value % total_tickets
}

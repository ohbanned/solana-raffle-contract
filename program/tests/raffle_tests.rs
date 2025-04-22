use solana_program::program_pack::Pack;
use solana_program_test::*;
use solana_sdk::{
    account::Account,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
    transport::TransportError,
    pubkey::Pubkey,
    system_program,
    sysvar::{clock::Clock, rent::Rent},
};
use std::mem;

// Import your program's entrypoint and state
use solcino::{
    raffle_instruction::RaffleInstruction,
    raffle_state::{Config, Raffle, RaffleStatus, TicketPurchase},
    process_instruction,
};

// Setup program test
async fn setup() -> (BanksClient, Keypair, Pubkey, Pubkey) {
    let program_id = Pubkey::new_unique();
    
    let mut program_test = ProgramTest::new(
        "solcino",
        program_id,
        processor!(process_instruction),
    );
    
    // Add test accounts if needed
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    // Config PDA
    let (config_pubkey, _) = Pubkey::find_program_address(
        &[b"config"],
        &program_id,
    );

    (banks_client, payer, recent_blockhash, config_pubkey)
}

// Test initializing the config
#[tokio::test]
async fn test_initialize_config() {
    let (mut banks_client, payer, recent_blockhash, config_pubkey) = setup().await;
    
    // Create treasury account
    let treasury = Keypair::new();
    
    // Define config parameters
    let ticket_price = 1_000_000_000; // 1 SOL
    let fee_basis_points = 500; // 5%
    
    // Create initialize config instruction
    let initialize_config_ix = solcino::raffle_instruction::initialize_config(
        &payer.pubkey(),
        &config_pubkey,
        &treasury.pubkey(),
        ticket_price,
        fee_basis_points,
    );
    
    let mut transaction = Transaction::new_with_payer(
        &[initialize_config_ix],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[&payer], recent_blockhash);
    
    // Process transaction
    banks_client.process_transaction(transaction).await.unwrap();
    
    // Verify config state
    let config_account = banks_client.get_account(config_pubkey).await.unwrap().unwrap();
    let config_data = Config::unpack(&config_account.data).unwrap();
    
    assert!(config_data.is_initialized);
    assert_eq!(config_data.admin, payer.pubkey());
    assert_eq!(config_data.treasury, treasury.pubkey());
    assert_eq!(config_data.ticket_price, ticket_price);
    assert_eq!(config_data.fee_basis_points, fee_basis_points);
}

// Test creating a raffle
#[tokio::test]
async fn test_initialize_raffle() {
    let (mut banks_client, payer, recent_blockhash, config_pubkey) = setup().await;
    
    // Initialize config first (copied from previous test)
    let treasury = Keypair::new();
    let ticket_price = 1_000_000_000; // 1 SOL
    let fee_basis_points = 500; // 5%
    
    let initialize_config_ix = solcino::raffle_instruction::initialize_config(
        &payer.pubkey(),
        &config_pubkey,
        &treasury.pubkey(),
        ticket_price,
        fee_basis_points,
    );
    
    let config_tx = Transaction::new_with_payer(
        &[initialize_config_ix],
        Some(&payer.pubkey()),
    );
    let mut signed_config_tx = config_tx.clone();
    signed_config_tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(signed_config_tx).await.unwrap();
    
    // Create a new raffle
    let raffle_keypair = Keypair::new();
    let raffle_authority = payer.pubkey();
    let title = b"Test Raffle Title".to_owned();
    let mut padded_title = [0u8; 32];
    padded_title[..title.len()].copy_from_slice(&title);
    let duration = 60 * 60 * 24; // 24 hours
    
    let initialize_raffle_ix = solcino::raffle_instruction::initialize_raffle(
        &raffle_authority,
        &raffle_keypair.pubkey(),
        padded_title,
        duration,
    );
    
    // Create a transaction for raffle creation
    let mut transaction = Transaction::new_with_payer(
        &[initialize_raffle_ix],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[&payer, &raffle_keypair], recent_blockhash);
    
    // Process the transaction
    banks_client.process_transaction(transaction).await.unwrap();
    
    // Verify raffle state
    let raffle_account = banks_client.get_account(raffle_keypair.pubkey()).await.unwrap().unwrap();
    let raffle_data = Raffle::unpack(&raffle_account.data).unwrap();
    
    assert!(raffle_data.is_initialized);
    assert_eq!(raffle_data.authority, raffle_authority);
    assert_eq!(raffle_data.title, padded_title);
    assert_eq!(raffle_data.status, RaffleStatus::Active);
    assert_eq!(raffle_data.tickets_sold, 0);
    assert!(raffle_data.end_time > 0);
}

// Test purchasing tickets for a raffle
#[tokio::test]
async fn test_purchase_tickets() {
    let (mut banks_client, payer, recent_blockhash, config_pubkey) = setup().await;
    
    // Initialize config first
    let treasury = Keypair::new();
    let ticket_price = 1_000_000_000; // 1 SOL
    let fee_basis_points = 500; // 5%
    
    let initialize_config_ix = solcino::raffle_instruction::initialize_config(
        &payer.pubkey(),
        &config_pubkey,
        &treasury.pubkey(),
        ticket_price,
        fee_basis_points,
    );
    
    let mut config_tx = Transaction::new_with_payer(
        &[initialize_config_ix],
        Some(&payer.pubkey()),
    );
    config_tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(config_tx).await.unwrap();
    
    // Create a new raffle
    let raffle_keypair = Keypair::new();
    let title = b"Test Raffle Title".to_owned();
    let mut padded_title = [0u8; 32];
    padded_title[..title.len()].copy_from_slice(&title);
    let duration = 60 * 60 * 24; // 24 hours
    
    let initialize_raffle_ix = solcino::raffle_instruction::initialize_raffle(
        &payer.pubkey(),
        &raffle_keypair.pubkey(),
        padded_title,
        duration,
    );
    
    let mut raffle_tx = Transaction::new_with_payer(
        &[initialize_raffle_ix],
        Some(&payer.pubkey()),
    );
    raffle_tx.sign(&[&payer, &raffle_keypair], recent_blockhash);
    banks_client.process_transaction(raffle_tx).await.unwrap();
    
    // Create a ticket purchaser (can be a different account than raffle creator)
    let purchaser = Keypair::new();
    
    // Fund the purchaser account
    let fund_purchaser_ix = system_instruction::transfer(
        &payer.pubkey(), 
        &purchaser.pubkey(), 
        10_000_000_000, // 10 SOL
    );
    
    let mut fund_tx = Transaction::new_with_payer(
        &[fund_purchaser_ix],
        Some(&payer.pubkey()),
    );
    fund_tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(fund_tx).await.unwrap();
    
    // Create a ticket purchase account
    let ticket_purchase_keypair = Keypair::new();
    let ticket_count = 3; // Buy 3 tickets
    
    // Purchase tickets
    let purchase_tickets_ix = solcino::raffle_instruction::purchase_tickets(
        &purchaser.pubkey(),
        &raffle_keypair.pubkey(),
        &ticket_purchase_keypair.pubkey(),
        &config_pubkey,
        &treasury.pubkey(),
        ticket_count,
    );
    
    let mut purchase_tx = Transaction::new_with_payer(
        &[purchase_tickets_ix],
        Some(&purchaser.pubkey()),
    );
    purchase_tx.sign(&[&purchaser, &ticket_purchase_keypair], recent_blockhash);
    
    // Process the purchase
    banks_client.process_transaction(purchase_tx).await.unwrap();
    
    // Verify ticket purchase state
    let ticket_purchase_account = banks_client
        .get_account(ticket_purchase_keypair.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    let ticket_data = TicketPurchase::unpack(&ticket_purchase_account.data).unwrap();
    
    assert!(ticket_data.is_initialized);
    assert_eq!(ticket_data.purchaser, purchaser.pubkey());
    assert_eq!(ticket_data.raffle, raffle_keypair.pubkey());
    assert_eq!(ticket_data.ticket_count, ticket_count);
    
    // Verify raffle state was updated
    let raffle_account = banks_client
        .get_account(raffle_keypair.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    let raffle_data = Raffle::unpack(&raffle_account.data).unwrap();
    assert_eq!(raffle_data.tickets_sold, ticket_count);
}

// Test VRF randomness request
#[tokio::test]
async fn test_request_randomness() {
    let (mut banks_client, payer, recent_blockhash, config_pubkey) = setup().await;
    
    // Initialize config
    let treasury = Keypair::new();
    let ticket_price = 1_000_000_000; // 1 SOL
    let fee_basis_points = 500; // 5%
    
    let initialize_config_ix = solcino::raffle_instruction::initialize_config(
        &payer.pubkey(),
        &config_pubkey,
        &treasury.pubkey(),
        ticket_price,
        fee_basis_points,
    );
    
    let mut config_tx = Transaction::new_with_payer(
        &[initialize_config_ix],
        Some(&payer.pubkey()),
    );
    config_tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(config_tx).await.unwrap();
    
    // Create a new raffle
    let raffle_keypair = Keypair::new();
    let title = b"Test Raffle Title".to_owned();
    let mut padded_title = [0u8; 32];
    padded_title[..title.len()].copy_from_slice(&title);
    let duration = 0; // End immediately for testing
    
    let initialize_raffle_ix = solcino::raffle_instruction::initialize_raffle(
        &payer.pubkey(),
        &raffle_keypair.pubkey(),
        padded_title,
        duration,
    );
    
    let mut raffle_tx = Transaction::new_with_payer(
        &[initialize_raffle_ix],
        Some(&payer.pubkey()),
    );
    raffle_tx.sign(&[&payer, &raffle_keypair], recent_blockhash);
    banks_client.process_transaction(raffle_tx).await.unwrap();
    
    // Buy tickets for the raffle
    let ticket_purchase_keypair = Keypair::new();
    let ticket_count = 3; // Buy 3 tickets
    
    // Purchase tickets
    let purchase_tickets_ix = solcino::raffle_instruction::purchase_tickets(
        &payer.pubkey(),
        &raffle_keypair.pubkey(),
        &ticket_purchase_keypair.pubkey(),
        &config_pubkey,
        &treasury.pubkey(),
        ticket_count,
    );
    
    let mut purchase_tx = Transaction::new_with_payer(
        &[purchase_tickets_ix],
        Some(&payer.pubkey()),
    );
    purchase_tx.sign(&[&payer, &ticket_purchase_keypair], recent_blockhash);
    banks_client.process_transaction(purchase_tx).await.unwrap();
    
    // Set up VRF account
    let vrf_keypair = Keypair::new();
    let switchboard_program_keypair = Keypair::new();
    let oracle_queue_keypair = Keypair::new();
    
    // Request randomness
    let request_randomness_ix = solcino::raffle_instruction::request_randomness(
        &payer.pubkey(),
        &raffle_keypair.pubkey(),
        &vrf_keypair.pubkey(),
        &payer.pubkey(),
        &switchboard_program_keypair.pubkey(),
        &oracle_queue_keypair.pubkey(),
    );
    
    let mut request_tx = Transaction::new_with_payer(
        &[request_randomness_ix],
        Some(&payer.pubkey()),
    );
    request_tx.sign(&[&payer, &vrf_keypair], recent_blockhash);
    
    // Process the request
    banks_client.process_transaction(request_tx).await.unwrap();
    
    // Verify raffle state was updated to indicate VRF request in progress
    let raffle_account = banks_client
        .get_account(raffle_keypair.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    let raffle_data = Raffle::unpack(&raffle_account.data).unwrap();
    assert!(raffle_data.vrf_request_in_progress);
    assert_eq!(raffle_data.vrf_account, vrf_keypair.pubkey());
}

// Test completing a raffle with VRF
#[tokio::test]
async fn test_complete_raffle_with_vrf() {
    let (mut banks_client, payer, recent_blockhash, config_pubkey) = setup().await;
    
    // Initialize config
    let treasury = Keypair::new();
    let ticket_price = 1_000_000_000; // 1 SOL
    let fee_basis_points = 500; // 5%
    
    let initialize_config_ix = solcino::raffle_instruction::initialize_config(
        &payer.pubkey(),
        &config_pubkey,
        &treasury.pubkey(),
        ticket_price,
        fee_basis_points,
    );
    
    let mut config_tx = Transaction::new_with_payer(
        &[initialize_config_ix],
        Some(&payer.pubkey()),
    );
    config_tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(config_tx).await.unwrap();
    
    // Create a new raffle with 0 duration so it ends immediately
    let raffle_keypair = Keypair::new();
    let title = b"Test Raffle Title".to_owned();
    let mut padded_title = [0u8; 32];
    padded_title[..title.len()].copy_from_slice(&title);
    let duration = 0; // End immediately for testing
    
    let initialize_raffle_ix = solcino::raffle_instruction::initialize_raffle(
        &payer.pubkey(),
        &raffle_keypair.pubkey(),
        padded_title,
        duration,
    );
    
    let mut raffle_tx = Transaction::new_with_payer(
        &[initialize_raffle_ix],
        Some(&payer.pubkey()),
    );
    raffle_tx.sign(&[&payer, &raffle_keypair], recent_blockhash);
    banks_client.process_transaction(raffle_tx).await.unwrap();
    
    // Buy tickets for the raffle
    let ticket_purchase_keypair = Keypair::new();
    let ticket_count = 3; // Buy 3 tickets
    
    // Purchase tickets
    let purchase_tickets_ix = solcino::raffle_instruction::purchase_tickets(
        &payer.pubkey(),
        &raffle_keypair.pubkey(),
        &ticket_purchase_keypair.pubkey(),
        &config_pubkey,
        &treasury.pubkey(),
        ticket_count,
    );
    
    let mut purchase_tx = Transaction::new_with_payer(
        &[purchase_tickets_ix],
        Some(&payer.pubkey()),
    );
    purchase_tx.sign(&[&payer, &ticket_purchase_keypair], recent_blockhash);
    banks_client.process_transaction(purchase_tx).await.unwrap();
    
    // Set up VRF account
    let vrf_keypair = Keypair::new();
    let switchboard_program_keypair = Keypair::new();
    let oracle_queue_keypair = Keypair::new();
    
    // Request randomness
    let request_randomness_ix = solcino::raffle_instruction::request_randomness(
        &payer.pubkey(),
        &raffle_keypair.pubkey(),
        &vrf_keypair.pubkey(),
        &payer.pubkey(),
        &switchboard_program_keypair.pubkey(),
        &oracle_queue_keypair.pubkey(),
    );
    
    let mut request_tx = Transaction::new_with_payer(
        &[request_randomness_ix],
        Some(&payer.pubkey()),
    );
    request_tx.sign(&[&payer, &vrf_keypair], recent_blockhash);
    banks_client.process_transaction(request_tx).await.unwrap();
    
    // Complete the raffle with VRF
    let complete_raffle_ix = solcino::raffle_instruction::complete_raffle_with_vrf(
        &payer.pubkey(),
        &raffle_keypair.pubkey(),
        &vrf_keypair.pubkey(),
        &ticket_purchase_keypair.pubkey(),
        &switchboard_program_keypair.pubkey(),
    );
    
    let mut complete_tx = Transaction::new_with_payer(
        &[complete_raffle_ix],
        Some(&payer.pubkey()),
    );
    complete_tx.sign(&[&payer], recent_blockhash);
    
    // Process the completion
    banks_client.process_transaction(complete_tx).await.unwrap();
    
    // Verify raffle state was updated to completed
    let raffle_account = banks_client
        .get_account(raffle_keypair.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    let raffle_data = Raffle::unpack(&raffle_account.data).unwrap();
    assert_eq!(raffle_data.status, RaffleStatus::Complete);
    assert_eq!(raffle_data.winner, ticket_purchase_keypair.pubkey());
    assert!(!raffle_data.vrf_request_in_progress);
    
    // Verify winner received the prize
    let winner_account = banks_client
        .get_account(ticket_purchase_keypair.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    // The winner account should have received the prize
    assert!(winner_account.lamports > 0);
}

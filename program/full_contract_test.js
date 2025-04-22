const { 
  Connection, 
  PublicKey, 
  Keypair, 
  SystemProgram, 
  Transaction, 
  sendAndConfirmTransaction,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY
} = require('@solana/web3.js');
const fs = require('fs');
const BN = require('bn.js');

// Program ID of the deployed raffle contract
const PROGRAM_ID = new PublicKey('7AcL747zBfKrgPzvNmkNuSDPfUb4mEa6oznemWAt3RRW');

// Connect to Solana devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Setup test wallet
let payer;
try {
  const payerSecretKey = new Uint8Array(JSON.parse(fs.readFileSync('./test-payer.json')));
  payer = Keypair.fromSecretKey(payerSecretKey);
  console.log('Loaded existing test wallet');
} catch (e) {
  payer = Keypair.generate();
  fs.writeFileSync('./test-payer.json', JSON.stringify(Array.from(payer.secretKey)));
  console.log('Generated new test wallet');
}

// Generate another wallet for a second participant
let participant;
try {
  const participantSecretKey = new Uint8Array(JSON.parse(fs.readFileSync('./test-participant.json')));
  participant = Keypair.fromSecretKey(participantSecretKey);
  console.log('Loaded existing participant wallet');
} catch (e) {
  participant = Keypair.generate();
  fs.writeFileSync('./test-participant.json', JSON.stringify(Array.from(participant.secretKey)));
  console.log('Generated new participant wallet');
}

console.log(`Test Wallet: ${payer.publicKey.toString()}`);
console.log(`Participant Wallet: ${participant.publicKey.toString()}`);

// Function to request airdrop
async function requestAirdrop(wallet) {
  try {
    const signature = await connection.requestAirdrop(wallet.publicKey, 2 * 10**9);
    await connection.confirmTransaction(signature);
    console.log(`Airdrop of 2 SOL received for ${wallet.publicKey.toString()}`);
    
    // Get balance to confirm
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`New balance: ${balance / 10**9} SOL`);
    
    return true;
  } catch (error) {
    console.error('Error during airdrop:', error);
    return false;
  }
}

// Helper functions for creating instruction data
function createInitConfigData(ticketPrice, feeBasisPoints) {
  // Instruction ID for InitializeConfig = 0
  const instructionBuffer = Buffer.alloc(1 + 8 + 2);
  instructionBuffer.writeUInt8(0, 0); // Instruction ID
  
  // Write ticketPrice as u64 (8 bytes)
  const ticketPriceBytes = new BN(ticketPrice).toArray('le', 8);
  for (let i = 0; i < 8; i++) {
    instructionBuffer.writeUInt8(ticketPriceBytes[i], 1 + i);
  }
  
  // Write feeBasisPoints as u16 (2 bytes)
  instructionBuffer.writeUInt16LE(feeBasisPoints, 9);
  
  return instructionBuffer;
}

function createInitRaffleData(title, duration) {
  // Instruction ID for InitializeRaffle = 1
  // Title is 32 bytes, duration is 8 bytes (u64)
  const instructionBuffer = Buffer.alloc(1 + 32 + 8);
  instructionBuffer.writeUInt8(1, 0); // Instruction ID
  
  // Write padded title (32 bytes)
  const titleBuffer = Buffer.from(title.padEnd(32, '\\0'), 'utf8');
  titleBuffer.copy(instructionBuffer, 1, 0, 32);
  
  // Write duration as u64 (8 bytes)
  const durationBytes = new BN(duration).toArray('le', 8);
  for (let i = 0; i < 8; i++) {
    instructionBuffer.writeUInt8(durationBytes[i], 33 + i);
  }
  
  return instructionBuffer;
}

function createPurchaseTicketsData(ticketCount) {
  // Instruction ID for PurchaseTickets = 2
  const instructionBuffer = Buffer.alloc(1 + 8);
  instructionBuffer.writeUInt8(2, 0); // Instruction ID
  
  // Write ticketCount as u64 (8 bytes)
  const ticketCountBytes = new BN(ticketCount).toArray('le', 8);
  for (let i = 0; i < 8; i++) {
    instructionBuffer.writeUInt8(ticketCountBytes[i], 1 + i);
  }
  
  return instructionBuffer;
}

function createRequestRandomnessData() {
  // Instruction ID for RequestRandomness = 8
  const instructionBuffer = Buffer.alloc(1);
  instructionBuffer.writeUInt8(8, 0); // Instruction ID
  return instructionBuffer;
}

function createCompleteRaffleWithVrfData() {
  // Instruction ID for CompleteRaffleWithVrf = 9
  const instructionBuffer = Buffer.alloc(1);
  instructionBuffer.writeUInt8(9, 0); // Instruction ID
  return instructionBuffer;
}

// Step 1: Initialize config with treasury and settings
async function initializeConfig(connection, payer, ticketPrice, feeBasisPoints) {
  try {
    console.log('----- Step 1: Initialize Config -----');
    
    // Find the config PDA
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );
    console.log('Config PDA:', configPda.toBase58());
    
    // Check if config account already exists
    let treasury;
    let signature = null;
    
    try {
      const accountInfo = await connection.getAccountInfo(configPda);
      
      if (accountInfo && accountInfo.data.length > 0) {
        console.log('Config account already exists, using existing config');
        
        // Config account exists, try to extract treasury pubkey from it
        // Assuming the treasury pubkey is stored at offset 11 (1 byte initialized + 2 bytes fee basis points + 8 bytes ticket price)
        const configData = accountInfo.data;
        if (configData.length >= 43) { // 1 + 2 + 8 + 32 (pubkey)
          treasury = new PublicKey(configData.slice(11, 43));
          console.log('Using existing treasury:', treasury.toBase58());
          
          return {
            configPda: configPda,
            treasury: treasury,
            signature: null
          };
        }
      }
    } catch (error) {
      console.log('Error checking config account, will try to initialize:', error.message);
    }
    
    // If we're here, config doesn't exist or we couldn't read the treasury
    // Generate a new keypair for the treasury
    const treasuryKeypair = Keypair.generate();
    treasury = treasuryKeypair.publicKey;
    console.log('Treasury:', treasury.toBase58());
    
    // Create instruction data
    const instructionData = Buffer.from(
      Uint8Array.of(
        0, // Initialize Config instruction index
        ...new BN(ticketPrice).toArray('le', 8), // u64 ticket price
        ...new BN(feeBasisPoints).toArray('le', 2)  // u16 fee basis points
      )
    );
    
    // Create instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // payer/authority
        { pubkey: configPda, isSigner: false, isWritable: true }, // config pda
        { pubkey: treasury, isSigner: false, isWritable: false }, // treasury
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });
    
    // Send transaction
    const tx = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(instruction),
      [payer],
      { commitment: 'confirmed' }
    );
    
    console.log('Config initialized successfully!');
    console.log('Transaction signature:', tx);
    signature = tx;
    
    return {
      configPda: configPda,
      treasury: treasury,
      signature: signature
    };
  } catch (error) {
    console.error('Error in config initialization process:', error);
    // Instead of throwing, we'll try to continue if we have a configPda
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );
    return {
      configPda: configPda,
      treasury: null, // We don't know the treasury
      signature: null
    };
  }
}

// Step 2: Create a new raffle
async function createRaffle(configData) {
  try {
    console.log('\n----- Step 2: Create Raffle -----');
    
    // Generate raffle keypair
    const raffleKeypair = Keypair.generate();
    console.log(`Raffle account: ${raffleKeypair.publicKey.toString()}`);
    
    // Save raffle keypair
    fs.writeFileSync('./test-raffle.json', JSON.stringify(Array.from(raffleKeypair.secretKey)));
    
    // Define title and duration
    const title = 'Test Raffle #1';
    const duration = 180; // 3 minutes in seconds
    
    // Calculate the size needed for the raffle account (estimate based on Raffle struct)
    const RAFFLE_SIZE = 1 + // is_initialized
                        32 + // authority pubkey
                        32 + // title
                        8 + // end_time
                        8 + // ticket_price
                        1 + // status
                        32 + // winner
                        8 + // tickets_sold
                        2 + // fee_basis_points
                        32 + // treasury
                        32 + // vrf_account
                        1; // vrf_request_in_progress
    
    // Create a transaction to create the raffle account and then initialize it
    const transaction = new Transaction();
    
    // 1. Create account with correct size and owner
    const lamports = await connection.getMinimumBalanceForRentExemption(RAFFLE_SIZE);
    
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: raffleKeypair.publicKey,
      lamports,
      space: RAFFLE_SIZE,
      programId: PROGRAM_ID, // Set the account owner to the program
    });
    
    transaction.add(createAccountInstruction);
    
    // 2. Initialize the raffle account with our data
    const initRaffleInstruction = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority
        { pubkey: raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
        { pubkey: configData.configPda, isSigner: false, isWritable: false }, // config account
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock sysvar
      ],
      programId: PROGRAM_ID,
      data: createInitRaffleData(title, duration),
    });
    
    transaction.add(initRaffleInstruction);
    
    // Send the transaction with both signers
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, raffleKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`Raffle created successfully!`);
    console.log(`Transaction signature: ${signature}`);
    
    // Get raffle data for config
    return {
      raffleKeypair,
      configPda: configData.configPda,
      treasury: configData.treasury,
      signature
    };
    
  } catch (error) {
    console.error('Error creating raffle:', error);
    throw error;
  }
}

// Step 3: Buy tickets for the raffle
async function purchaseTickets(raffleData, configData, wallet, ticketCount) {
  console.log(`\n----- Step 3: Purchase Tickets (${wallet === payer ? 'Payer' : 'Participant'}) -----`);
  
  try {
    // Create ticket purchase account
    const ticketPurchaseKeypair = Keypair.generate();
    console.log(`Ticket purchase account: ${ticketPurchaseKeypair.publicKey.toString()}`);
    
    // Save ticket purchase keypair
    const filename = wallet === payer ? './test-payer-tickets.json' : './test-participant-tickets.json';
    fs.writeFileSync(filename, JSON.stringify(Array.from(ticketPurchaseKeypair.secretKey)));
    
    // Get balance before
    const balanceBefore = await connection.getBalance(wallet.publicKey);
    console.log(`Balance before purchase: ${balanceBefore / 10**9} SOL`);
    
    // Get treasury balance before
    const treasuryBalanceBefore = await connection.getBalance(configData.treasury);
    console.log(`Treasury balance before: ${treasuryBalanceBefore / 10**9} SOL`);
    
    // Calculate the size needed for the ticket purchase account
    const TICKET_PURCHASE_SIZE = 1 + // is_initialized
                                32 + // raffle pubkey
                                32 + // purchaser pubkey
                                8 + // ticket_count
                                8; // purchase_time
    
    // Step 3a: Create the account
    console.log('Creating ticket purchase account...');
    const lamports = await connection.getMinimumBalanceForRentExemption(TICKET_PURCHASE_SIZE);
    
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: ticketPurchaseKeypair.publicKey,
      lamports,
      space: TICKET_PURCHASE_SIZE,
      programId: PROGRAM_ID, // Set the account owner to the program
    });
    
    // Send the account creation transaction
    const createAccountTx = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(createAccountInstruction),
      [wallet, ticketPurchaseKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`Ticket purchase account created. Tx: ${createAccountTx}`);
    
    // Step 3b: Initialize the account data and purchase tickets
    console.log('Purchasing tickets...');
    
    // Create the purchase instruction
    const purchaseInstruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // purchaser
        { pubkey: raffleData.raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
        { pubkey: ticketPurchaseKeypair.publicKey, isSigner: false, isWritable: true }, // ticket purchase account
        { pubkey: configData.treasury, isSigner: false, isWritable: true }, // treasury
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock sysvar
      ],
      programId: PROGRAM_ID,
      data: createPurchaseTicketsData(ticketCount),
    });
    
    // Send the purchase transaction
    const purchaseTx = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(purchaseInstruction),
      [wallet],
      { commitment: 'confirmed' }
    );
    
    console.log(`Ticket purchase successful!`);
    console.log(`Transaction signature: ${purchaseTx}`);
    
    // Get balance after
    const balanceAfter = await connection.getBalance(wallet.publicKey);
    console.log(`Balance after purchase: ${balanceAfter / 10**9} SOL`);
    console.log(`Cost: ${(balanceBefore - balanceAfter) / 10**9} SOL`);
    
    // Get treasury balance after
    const treasuryBalanceAfter = await connection.getBalance(configData.treasury);
    console.log(`Treasury balance after: ${treasuryBalanceAfter / 10**9} SOL`);
    console.log(`Fee collected: ${(treasuryBalanceAfter - treasuryBalanceBefore) / 10**9} SOL`);
    
    // Return ticket purchase info
    return {
      ...raffleData,
      ticketPurchaseKeypair,
      buyer: wallet.publicKey,
      ticketCount,
      signature: purchaseTx
    };
    
  } catch (error) {
    console.error('Error purchasing tickets:', error);
    throw error;
  }
}

// Step 4: Request randomness (initiate raffle ending)
async function requestRandomness(raffleData) {
  console.log('\n----- Step 4: Request Randomness -----');
  
  try {
    // We need a VRF account for Switchboard
    const vrfKeypair = Keypair.generate();
    console.log(`VRF account: ${vrfKeypair.publicKey.toString()}`);
    
    // Save VRF keypair for later
    fs.writeFileSync('./test-vrf.json', JSON.stringify(Array.from(vrfKeypair.secretKey)));
    
    // Generate switchboard program account (this is a dummy for testing)
    const switchboardProgram = Keypair.generate();
    console.log(`Switchboard program: ${switchboardProgram.publicKey.toString()}`);
    
    // Generate oracle queue account (this is a dummy for testing)
    const oracleQueue = Keypair.generate();
    console.log(`Oracle queue: ${oracleQueue.publicKey.toString()}`);
    
    // Create instruction data
    const instructionData = createRequestRandomnessData();
    
    // Create instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority
        { pubkey: raffleData.raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
        { pubkey: vrfKeypair.publicKey, isSigner: true, isWritable: true }, // VRF account
        { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // payer
        { pubkey: switchboardProgram.publicKey, isSigner: false, isWritable: false }, // switchboard program
        { pubkey: oracleQueue.publicKey, isSigner: false, isWritable: false }, // oracle queue
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });
    
    // Create transaction
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, vrfKeypair]
    );
    
    console.log(`Randomness requested successfully!`);
    console.log(`Transaction signature: ${signature}`);
    
    // Return updated raffle data
    return {
      ...raffleData,
      vrfKeypair,
      switchboardProgram: switchboardProgram.publicKey,
    };
    
  } catch (error) {
    console.error('Error requesting randomness:', error);
    throw error;
  }
}

// Step 5: Complete raffle with VRF and distribute prize
async function completeRaffle(raffleData) {
  console.log('\n----- Step 5: Complete Raffle with VRF -----');
  
  try {
    // We use participant's ticket account as the winner for this test
    const winnerAccount = raffleData.ticketPurchaseKeypair.publicKey;
    console.log(`Winner account: ${winnerAccount.toString()}`);
    
    // Get balance before
    const winnerBalanceBefore = await connection.getBalance(winnerAccount);
    console.log(`Winner balance before: ${winnerBalanceBefore / 10**9} SOL`);
    
    // Get raffle balance (prize pool)
    const raffleBalanceBefore = await connection.getBalance(raffleData.raffleKeypair.publicKey);
    console.log(`Raffle prize pool: ${raffleBalanceBefore / 10**9} SOL`);
    
    // Create instruction data
    const instructionData = createCompleteRaffleWithVrfData();
    
    // Create instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority
        { pubkey: raffleData.raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
        { pubkey: raffleData.vrfKeypair.publicKey, isSigner: false, isWritable: false }, // VRF account
        { pubkey: winnerAccount, isSigner: false, isWritable: true }, // winner account
        { pubkey: raffleData.switchboardProgram, isSigner: false, isWritable: false }, // switchboard program
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock sysvar
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });
    
    // Create transaction
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer]
    );
    
    console.log(`Raffle completed successfully!`);
    console.log(`Transaction signature: ${signature}`);
    
    // Get winner balance after
    const winnerBalanceAfter = await connection.getBalance(winnerAccount);
    console.log(`Winner balance after: ${winnerBalanceAfter / 10**9} SOL`);
    console.log(`Prize won: ${(winnerBalanceAfter - winnerBalanceBefore) / 10**9} SOL`);
    
    // Get raffle balance after (should be 0)
    const raffleBalanceAfter = await connection.getBalance(raffleData.raffleKeypair.publicKey);
    console.log(`Raffle prize pool after: ${raffleBalanceAfter / 10**9} SOL`);
    
    return true;
    
  } catch (error) {
    console.error('Error completing raffle:', error);
    throw error;
  }
}

// Main test function running the full flow
async function runFullTest() {
  try {
    console.log('===== SOLCINO RAFFLE CONTRACT FULL FUNCTIONAL TEST =====');
    console.log('Program ID:', PROGRAM_ID.toBase58());
    console.log('Network:', connection.rpcEndpoint);

    // Request SOL for testing
    await requestAirdrop(payer);
    await requestAirdrop(participant);

    // Define raffle settings
    const ticketPrice = 100000000; // 0.1 SOL
    const feeBasisPoints = 500; // 5%

    // Step 1: Initialize config
    const configData = await initializeConfig(connection, payer, ticketPrice, feeBasisPoints);
    if (!configData.configPda) {
      throw new Error('Failed to get config PDA');
    }
    
    // Step 2: Create a raffle
    const raffleData = await createRaffle(configData);
    
    // Step 3: Purchase tickets from different wallets
    console.log('\n----- Step 3a: Purchase Tickets (Payer) -----');
    const payerTicketData = await purchaseTickets(raffleData, configData, payer, 3);
    
    console.log('\n----- Step 3b: Purchase Tickets (Participant) -----');
    const participantTicketData = await purchaseTickets(raffleData, configData, participant, 5);
    
    // Sleep for 15 seconds to make sure raffle time has advanced
    console.log('\nWaiting 15 seconds for raffle to advance...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Step 4: Request randomness (initiate raffle ending)
    const randomnessData = await requestRandomness(raffleData);
    
    // Step 5: Complete raffle with VRF and distribute prize
    await completeRaffle(randomnessData);
    
    console.log('\n✅ FULL TEST COMPLETED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ FULL TEST FAILED:', error);
    return false;
  }
}

// Add error handling
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Run the full test
console.log('Starting full functional test...');
runFullTest();

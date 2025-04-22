const { 
  Connection, 
  PublicKey, 
  Keypair, 
  SystemProgram, 
  Transaction, 
  sendAndConfirmTransaction,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const fs = require('fs');
const BN = require('bn.js');

// Program ID of the newly deployed raffle contract
const PROGRAM_ID = new PublicKey('7AcL747zBfKrgPzvNmkNuSDPfUb4mEa6oznemWAt3RRW');

// Connect to Solana devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Load test wallet
let payer;
try {
  const payerSecretKey = new Uint8Array(JSON.parse(fs.readFileSync('./test-payer.json')));
  payer = Keypair.fromSecretKey(payerSecretKey);
  console.log('Loaded test wallet:', payer.publicKey.toString());
} catch (e) {
  payer = Keypair.generate();
  fs.writeFileSync('./test-payer.json', JSON.stringify(Array.from(payer.secretKey)));
  console.log('Generated new test wallet:', payer.publicKey.toString());
}

// Load participant wallet
let participant;
try {
  const participantSecretKey = new Uint8Array(JSON.parse(fs.readFileSync('./test-participant.json')));
  participant = Keypair.fromSecretKey(participantSecretKey);
  console.log('Loaded participant wallet:', participant.publicKey.toString());
} catch (e) {
  participant = Keypair.generate();
  fs.writeFileSync('./test-participant.json', JSON.stringify(Array.from(participant.secretKey)));
  console.log('Generated new participant wallet:', participant.publicKey.toString());
}

// Find the config PDA
const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('config')],
  PROGRAM_ID
);
console.log('Config PDA:', configPda.toString());

// Create a VRF account for testing
const vrfKeypair = Keypair.generate();
console.log('VRF account:', vrfKeypair.publicKey.toString());

// Define a Mock Switchboard program for VRF
const switchboardProgramId = new PublicKey('SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f');
const oracleQueueId = Keypair.generate().publicKey;
console.log('Mock Switchboard program:', switchboardProgramId.toString());
console.log('Mock Oracle Queue:', oracleQueueId.toString());

// Step 1: Create a new raffle with a very short duration
async function createRaffle() {
  console.log('\n***** CREATING NEW RAFFLE *****');
  
  // Generate a keypair for the raffle
  const raffleKeypair = Keypair.generate();
  console.log('Raffle account:', raffleKeypair.publicKey.toString());
  
  // Save raffle keypair for future use
  fs.writeFileSync('./vrf-test-raffle.json', JSON.stringify(Array.from(raffleKeypair.secretKey)));
  
  // Fetch config info to get treasury
  const configInfo = await connection.getAccountInfo(configPda);
  if (!configInfo) {
    throw new Error('Config not found! Please run init_config_for_new_program.js first');
  }
  
  // Read treasury from config account data (at offset 11, length 32)
  const treasuryPubkey = new PublicKey(configInfo.data.slice(11, 43));
  console.log('Treasury:', treasuryPubkey.toString());
  
  // Define raffle parameters - short duration for testing
  const title = 'VRF Test Raffle';
  const duration = 30; // 30 seconds, short for testing
  
  // Create instruction data for initializing raffle
  const instructionData = Buffer.from(
    Uint8Array.of(
      1, // Initialize Raffle instruction index
      ...Array.from(Buffer.from(title.padEnd(32, '\0'))), // 32 byte title
      ...new BN(duration).toArray('le', 8) // u64 duration in seconds
    )
  );
  
  // Calculate size for raffle account
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
  
  // Create account first
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: raffleKeypair.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(RAFFLE_SIZE),
    space: RAFFLE_SIZE,
    programId: PROGRAM_ID,
  });
  
  // Initialize raffle
  const initRaffleIx = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority
      { pubkey: raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
      { pubkey: configPda, isSigner: false, isWritable: false }, // config account
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock sysvar
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });
  
  // Send transaction
  try {
    const tx = new Transaction().add(createAccountIx).add(initRaffleIx);
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer, raffleKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('Raffle created successfully!');
    console.log('Transaction signature:', signature);
    
    return {
      raffleKeypair,
      configPda,
      treasury: treasuryPubkey,
      signature
    };
  } catch (error) {
    console.error('Error creating raffle:', error);
    
    // Print transaction logs if available
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach(log => console.log(log));
    }
    
    throw error;
  }
}

// Step 2: Purchase tickets
async function purchaseTickets(raffleData, buyerWallet, ticketCount) {
  console.log(`\n***** PURCHASING ${ticketCount} TICKETS FOR ${buyerWallet === payer ? 'PAYER' : 'PARTICIPANT'} *****`);
  
  // Create ticket purchase account
  const ticketPurchaseKeypair = Keypair.generate();
  console.log('Ticket purchase account:', ticketPurchaseKeypair.publicKey.toString());
  
  // Save ticket purchase keypair
  const filename = buyerWallet === payer ? './vrf-test-payer-tickets.json' : './vrf-test-participant-tickets.json';
  fs.writeFileSync(filename, JSON.stringify(Array.from(ticketPurchaseKeypair.secretKey)));
  
  // Calculate size for ticket purchase account
  const TICKET_PURCHASE_SIZE = 1 + // is_initialized
                             32 + // raffle pubkey
                             32 + // purchaser pubkey
                             8 + // ticket_count
                             8; // purchase_time
  
  // Create account instruction
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: buyerWallet.publicKey,
    newAccountPubkey: ticketPurchaseKeypair.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(TICKET_PURCHASE_SIZE),
    space: TICKET_PURCHASE_SIZE,
    programId: PROGRAM_ID,
  });
  
  // Create purchase instruction
  const purchaseIx = new TransactionInstruction({
    keys: [
      { pubkey: buyerWallet.publicKey, isSigner: true, isWritable: true }, // purchaser
      { pubkey: raffleData.raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
      { pubkey: ticketPurchaseKeypair.publicKey, isSigner: false, isWritable: true }, // ticket purchase account
      { pubkey: raffleData.treasury, isSigner: false, isWritable: true }, // treasury
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock sysvar
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(
      Uint8Array.of(
        2, // Purchase Tickets instruction index
        ...new BN(ticketCount).toArray('le', 8) // u64 ticket count
      )
    ),
  });
  
  // Send transaction
  try {
    const tx = new Transaction()
      .add(createAccountIx)
      .add(purchaseIx);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [buyerWallet, ticketPurchaseKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('Tickets purchased successfully!');
    console.log('Transaction signature:', signature);
    
    return {
      ...raffleData,
      ticketPurchaseKeypair,
      buyer: buyerWallet.publicKey,
      signature
    };
  } catch (error) {
    console.error('Error purchasing tickets:', error);
    
    // Print transaction logs if available
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach(log => console.log(log));
    }
    
    throw error;
  }
}

// Step 3: Request randomness (VRF)
async function requestRandomness(raffleData) {
  console.log('\n***** REQUESTING RANDOMNESS (VRF) *****');

  // Need to create a VRF account first
  const VRF_ACCOUNT_SIZE = 1000; // Large enough for a mock VRF account
  
  // Create the VRF account
  const createVrfAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: vrfKeypair.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(VRF_ACCOUNT_SIZE),
    space: VRF_ACCOUNT_SIZE,
    programId: PROGRAM_ID, // In a real deployment, this would be the Switchboard program
  });
  
  // Create request randomness instruction
  const requestRandomnessIx = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority/initiator
      { pubkey: raffleData.raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
      { pubkey: vrfKeypair.publicKey, isSigner: false, isWritable: true }, // vrf account
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: switchboardProgramId, isSigner: false, isWritable: false }, // switchboard program
      { pubkey: oracleQueueId, isSigner: false, isWritable: false }, // oracle queue
      // Additional accounts would be needed for a real Switchboard VRF request
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(
      Uint8Array.of(
        8 // Request Randomness instruction index
      )
    ),
  });
  
  // Send transaction
  try {
    const tx = new Transaction()
      .add(createVrfAccountIx)
      .add(requestRandomnessIx);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer, vrfKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('Randomness requested successfully!');
    console.log('Transaction signature:', signature);
    
    return {
      ...raffleData,
      vrfKeypair,
      vrfSignature: signature
    };
  } catch (error) {
    console.error('Error requesting randomness:', error);
    
    // Print transaction logs if available
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach(log => console.log(log));
    }
    
    throw error;
  }
}

// Step 4: Complete raffle with VRF
async function completeRaffle(raffleData, ticketPurchaseData) {
  console.log('\n***** COMPLETING RAFFLE WITH VRF *****');
  
  // Get balances before
  const balanceBefore = await connection.getBalance(ticketPurchaseData.ticketPurchaseKeypair.publicKey);
  console.log(`Ticket purchase account balance before: ${balanceBefore / LAMPORTS_PER_SOL} SOL`);
  
  const raffleBalanceBefore = await connection.getBalance(raffleData.raffleKeypair.publicKey);
  console.log(`Raffle prize pool: ${raffleBalanceBefore / LAMPORTS_PER_SOL} SOL`);
  
  // Create complete raffle instruction
  const completeRaffleIx = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority
      { pubkey: raffleData.raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
      { pubkey: vrfKeypair.publicKey, isSigner: false, isWritable: false }, // vrf account
      { pubkey: ticketPurchaseData.ticketPurchaseKeypair.publicKey, isSigner: false, isWritable: true }, // winner account
      { pubkey: switchboardProgramId, isSigner: false, isWritable: false }, // switchboard program
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock sysvar
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(
      Uint8Array.of(
        9 // Complete Raffle with VRF instruction index
      )
    ),
  });
  
  // Send transaction
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(completeRaffleIx),
      [payer],
      { commitment: 'confirmed' }
    );
    
    console.log('Raffle completed successfully!');
    console.log('Transaction signature:', signature);
    
    // Get balances after
    const balanceAfter = await connection.getBalance(ticketPurchaseData.ticketPurchaseKeypair.publicKey);
    console.log(`Ticket purchase account balance after: ${balanceAfter / LAMPORTS_PER_SOL} SOL`);
    console.log(`Prize won: ${(balanceAfter - balanceBefore) / LAMPORTS_PER_SOL} SOL`);
    
    const raffleBalanceAfter = await connection.getBalance(raffleData.raffleKeypair.publicKey);
    console.log(`Raffle prize pool after: ${raffleBalanceAfter / LAMPORTS_PER_SOL} SOL`);
    
    return {
      ...raffleData,
      completeSignature: signature
    };
  } catch (error) {
    console.error('Error completing raffle:', error);
    
    // Print transaction logs if available
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach(log => console.log(log));
    }
    
    throw error;
  }
}

// Fund the participant wallet
async function fundParticipant() {
  console.log('\n***** FUNDING PARTICIPANT WALLET *****');
  const participantBalance = await connection.getBalance(participant.publicKey);
  console.log(`Participant balance: ${participantBalance / LAMPORTS_PER_SOL} SOL`);
  
  if (participantBalance < 0.5 * LAMPORTS_PER_SOL) {
    // Transfer 0.5 SOL from payer to participant
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: participant.publicKey,
        lamports: 0.5 * LAMPORTS_PER_SOL,
      })
    );
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer],
      { commitment: 'confirmed' }
    );
    
    console.log(`Transferred 0.5 SOL to participant. Signature: ${signature}`);
    const newBalance = await connection.getBalance(participant.publicKey);
    console.log(`New participant balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
  } else {
    console.log('Participant already has sufficient funds');
  }
}

// Run full test
async function runTest() {
  try {
    // Fund participant wallet
    await fundParticipant();
    
    // Step 1: Create a short-duration raffle
    const raffleData = await createRaffle();
    
    // Step 2a: Payer buys tickets
    const payerTicketData = await purchaseTickets(raffleData, payer, 3);
    
    // Step 2b: Participant buys tickets
    const participantTicketData = await purchaseTickets(raffleData, participant, 2);
    
    // Sleep to wait for raffle to end
    console.log('\nWaiting for raffle to end (35 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 35000));
    
    // Step 3: Request randomness
    const randomnessData = await requestRandomness(raffleData);
    
    // Step 4: Complete raffle - using participant as winner for this test
    await completeRaffle(randomnessData, participantTicketData);
    
    console.log('\n✅ VRF TEST COMPLETED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ VRF TEST FAILED:', error.message);
  }
}

// Execute the test
runTest();

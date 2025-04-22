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

// Find the config PDA
const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('config')],
  PROGRAM_ID
);
console.log('Config PDA:', configPda.toString());

// Step 1: Create a new raffle
async function createRaffle() {
  console.log('\n***** CREATING NEW RAFFLE *****');
  
  // Generate a keypair for the raffle
  const raffleKeypair = Keypair.generate();
  console.log('Raffle account:', raffleKeypair.publicKey.toString());
  
  // Save raffle keypair for future use
  fs.writeFileSync('./new-test-raffle.json', JSON.stringify(Array.from(raffleKeypair.secretKey)));
  
  // Fetch config info to get treasury
  const configInfo = await connection.getAccountInfo(configPda);
  if (!configInfo) {
    throw new Error('Config not found! Please run init_config_for_new_program.js first');
  }
  
  // Define raffle parameters
  const title = 'Raffle Test Apr 2025';
  const duration = 180; // 3 minutes
  
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
async function purchaseTickets(raffleData, ticketCount) {
  console.log(`\n***** PURCHASING ${ticketCount} TICKETS *****`);
  
  // Fetch config info to get treasury
  const configInfo = await connection.getAccountInfo(configPda);
  if (!configInfo) {
    throw new Error('Config not found!');
  }
  
  // Read treasury from config account data (at offset 11, length 32)
  const treasuryPubkey = new PublicKey(configInfo.data.slice(11, 43));
  console.log('Treasury:', treasuryPubkey.toString());
  
  // Get balance before
  const balanceBefore = await connection.getBalance(payer.publicKey);
  console.log(`Balance before purchase: ${balanceBefore / LAMPORTS_PER_SOL} SOL`);
  
  // Get treasury balance before
  const treasuryBalanceBefore = await connection.getBalance(treasuryPubkey);
  console.log(`Treasury balance before: ${treasuryBalanceBefore / LAMPORTS_PER_SOL} SOL`);
  
  // Create ticket purchase account
  const ticketPurchaseKeypair = Keypair.generate();
  console.log('Ticket purchase account:', ticketPurchaseKeypair.publicKey.toString());
  
  // Calculate the size needed for the ticket purchase account
  const TICKET_PURCHASE_SIZE = 1 + // is_initialized
                             32 + // raffle pubkey
                             32 + // purchaser pubkey
                             8 + // ticket_count
                             8; // purchase_time
  
  // Create account instruction
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: ticketPurchaseKeypair.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(TICKET_PURCHASE_SIZE),
    space: TICKET_PURCHASE_SIZE,
    programId: PROGRAM_ID,
  });
  
  // Create purchase instruction
  const purchaseIx = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // purchaser
      { pubkey: raffleData.raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
      { pubkey: ticketPurchaseKeypair.publicKey, isSigner: false, isWritable: true }, // ticket purchase account
      { pubkey: treasuryPubkey, isSigner: false, isWritable: true }, // treasury
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
      [payer, ticketPurchaseKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('Tickets purchased successfully!');
    console.log('Transaction signature:', signature);
    
    // Get balance after
    const balanceAfter = await connection.getBalance(payer.publicKey);
    console.log(`Balance after purchase: ${balanceAfter / LAMPORTS_PER_SOL} SOL`);
    console.log(`Cost: ${(balanceBefore - balanceAfter) / LAMPORTS_PER_SOL} SOL`);
    
    // Get treasury balance after
    const treasuryBalanceAfter = await connection.getBalance(treasuryPubkey);
    console.log(`Treasury balance after: ${treasuryBalanceAfter / LAMPORTS_PER_SOL} SOL`);
    console.log(`Fee collected: ${(treasuryBalanceAfter - treasuryBalanceBefore) / LAMPORTS_PER_SOL} SOL`);
    
    return {
      ...raffleData,
      ticketPurchaseKeypair,
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

// Run full test
async function runTest() {
  try {
    // Step 1: Create a new raffle
    const raffleData = await createRaffle();
    
    // Wait a bit to ensure the transaction is fully confirmed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Purchase tickets
    await purchaseTickets(raffleData, 1);
    
    console.log('\n✅ TEST COMPLETED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
  }
}

// Execute the test
runTest();

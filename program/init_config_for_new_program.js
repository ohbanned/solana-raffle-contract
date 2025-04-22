const { 
  Connection, 
  PublicKey, 
  Keypair, 
  SystemProgram, 
  Transaction, 
  sendAndConfirmTransaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const fs = require('fs');
const BN = require('bn.js');

// Program ID of the newly deployed raffle contract
const PROGRAM_ID = new PublicKey('7AcL747zBfKrgPzvNmkNuSDPfUb4mEa6oznemWAt3RRW');

// Connect to Solana devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Setup test wallet
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

// Request airdrop if balance is too low
async function ensureFunding() {
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Current balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    try {
      console.log('Requesting airdrop...');
      const signature = await connection.requestAirdrop(payer.publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(signature);
      const newBalance = await connection.getBalance(payer.publicKey);
      console.log(`New balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
    } catch (error) {
      console.log('Airdrop failed, continuing anyway:', error.message);
    }
  }
}

// Initialize the config for the new program
async function initializeConfig() {
  console.log('\n***** INITIALIZING CONFIG FOR NEW PROGRAM *****');
  
  // Find the config PDA for the new program
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );
  console.log('Config PDA:', configPda.toString());
  
  // Check if config already exists
  const configInfo = await connection.getAccountInfo(configPda);
  if (configInfo !== null) {
    console.log('Config already exists for this program ID, skipping initialization');
    return { configPda, treasury: null };
  }
  
  // Generate a new treasury keypair
  const treasuryKeypair = Keypair.generate();
  console.log('New treasury account:', treasuryKeypair.publicKey.toString());
  
  // Define settings
  const ticketPrice = 100000000; // 0.1 SOL
  const feeBasisPoints = 500; // 5%
  
  // Create instruction data for initializing config
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
      { pubkey: treasuryKeypair.publicKey, isSigner: false, isWritable: false }, // treasury
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });
  
  // Send transaction
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(instruction),
      [payer],
      { commitment: 'confirmed' }
    );
    
    console.log('Config initialized successfully!');
    console.log('Transaction signature:', signature);
    
    // Save treasury keypair for future reference
    fs.writeFileSync('./new-test-treasury.json', JSON.stringify(Array.from(treasuryKeypair.secretKey)));
    
    return {
      configPda,
      treasury: treasuryKeypair.publicKey,
      signature
    };
  } catch (error) {
    console.error('Error initializing config:', error);
    // Print transaction logs if available
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach(log => console.log(log));
    }
    throw error;
  }
}

// Run the initialization process
async function run() {
  try {
    await ensureFunding();
    const result = await initializeConfig();
    console.log('\nConfig setup complete!');
    console.log('Config PDA:', result.configPda.toString());
    if (result.treasury) {
      console.log('Treasury:', result.treasury.toString());
    }
  } catch (error) {
    console.error('\nConfig initialization failed:', error.message);
  }
}

// Execute the script
run();

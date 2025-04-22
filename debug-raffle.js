const { 
  Connection, 
  PublicKey, 
  Keypair,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY
} = require('@solana/web3.js');

// Updated Constants
const PROGRAM_ID = new PublicKey('8b86FXFYgo2gD2q2ugR5LgxFopuS8UCjFw6QTsb7TCF1');

// Use Helius RPC for better reliability
const connection = new Connection('https://devnet.helius-rpc.com/?api-key=05614dbf-932c-4992-8c2c-e703c282ffc9', 'confirmed');

// Admin wallet
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Function to inspect the logs of a transaction simulation
async function simulateTransaction(transaction, signers) {
  try {
    console.log("Simulating transaction...");
    
    // Serialize the transaction
    transaction.feePayer = payer.publicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    
    // Sign the transaction if signers are provided
    if (signers && signers.length > 0) {
      transaction.sign(...signers);
    }
    
    // Simulate the transaction
    const simulationResult = await connection.simulateTransaction(transaction);
    
    console.log("\nSimulation Result:", JSON.stringify(simulationResult, null, 2));
    
    if (simulationResult.value.logs) {
      console.log("\nTransaction Logs:");
      simulationResult.value.logs.forEach((log, i) => {
        console.log(`  ${i}: ${log}`);
      });
    }
    
    return simulationResult.value.err ? false : true;
  } catch (error) {
    console.error("Simulation error:", error);
    return false;
  }
}

// Function to create a raffle with keypair approach
async function testKeyPairRaffle() {
  try {
    // First, get the config PDA
    const [configPDA, _] = await PublicKey.findProgramAddress(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    
    console.log("=== Testing Keypair Raffle ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Config PDA:", configPDA.toString());
    
    // Generate a new keypair for the raffle account
    const raffleKeypair = Keypair.generate();
    console.log("Raffle Keypair:", raffleKeypair.publicKey.toString());
    
    // Create raffle parameters
    const title = "Test Raffle";
    const titleBuffer = Buffer.alloc(32, 0);
    Buffer.from(title).copy(titleBuffer);
    const duration = 300; // 5 minutes
    
    // Calculate space needed for the raffle account
    const RAFFLE_ACCOUNT_SIZE = 1 + 32 + 32 + 8 + 8 + 1 + 32 + 8 + 2 + 32 + 32 + 1 + 1;
    console.log("Account size:", RAFFLE_ACCOUNT_SIZE);
    
    // Calculate rent exemption amount
    const rentExemption = await connection.getMinimumBalanceForRentExemption(RAFFLE_ACCOUNT_SIZE);
    
    // Create account instruction
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: raffleKeypair.publicKey,
      lamports: rentExemption,
      space: RAFFLE_ACCOUNT_SIZE,
      programId: PROGRAM_ID
    });
    
    // Create initialize raffle instruction data
    const instructionData = Buffer.alloc(41);
    instructionData.writeUInt8(1, 0); // Instruction 1 = Initialize Raffle
    titleBuffer.copy(instructionData, 1); // Title (32 bytes)
    instructionData.writeBigUInt64LE(BigInt(duration), 33); // Duration (8 bytes)
    
    // Create initialize raffle instruction
    const initRaffleIx = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: raffleKeypair.publicKey, isSigner: false, isWritable: true },
        { pubkey: configPDA, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    // Combine instructions into a single transaction
    const transaction = new Transaction()
      .add(createAccountIx)
      .add(initRaffleIx);
    
    // Simulate the transaction to get detailed logs
    const isSimulationSuccessful = await simulateTransaction(
      transaction, 
      [payer, raffleKeypair]
    );
    
    return {
      success: isSimulationSuccessful,
      approach: "keypair"
    };
  } catch (error) {
    console.error("Error in keypair test:", error);
    return { success: false, approach: "keypair", error: error.message };
  }
}

// Function to test PDA-based raffle creation
async function testPDARaffle() {
  try {
    // First, get the config PDA
    const [configPDA, _] = await PublicKey.findProgramAddress(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    
    console.log("\n=== Testing PDA Raffle ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Config PDA:", configPDA.toString());
    
    // Create raffle parameters
    const title = "Test Raffle";
    const titleBuffer = Buffer.alloc(32, 0);
    Buffer.from(title).copy(titleBuffer);
    const duration = 300; // 5 minutes
    
    // Get current time for seed derivation
    const timestamp = Math.floor(Date.now() / 1000);
    const timestampBytes = Buffer.alloc(8);
    timestampBytes.writeBigInt64LE(BigInt(timestamp), 0);
    console.log("Current timestamp:", timestamp);
    
    // Print raw timestamp bytes
    console.log("Timestamp bytes:", Buffer.from(timestampBytes).toString('hex'));
    
    // Derive the Raffle PDA
    const seeds = [
      Buffer.from("raffle"),
      payer.publicKey.toBuffer(),
      timestampBytes,
      titleBuffer
    ];
    
    const [rafflePDA, raffleBump] = await PublicKey.findProgramAddress(
      seeds,
      PROGRAM_ID
    );
    
    console.log("Derived Raffle PDA:", rafflePDA.toString());
    console.log("Bump seed:", raffleBump);
    
    // Create initialize raffle instruction data
    const instructionData = Buffer.alloc(41);
    instructionData.writeUInt8(1, 0); // Instruction 1 = Initialize Raffle
    titleBuffer.copy(instructionData, 1); // Title (32 bytes)
    instructionData.writeBigUInt64LE(BigInt(duration), 33); // Duration (8 bytes)
    
    // Create initialize raffle instruction
    const tx = new Transaction().add(
      new TransactionInstruction({
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: rafflePDA, isSigner: false, isWritable: true },
          { pubkey: configPDA, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
        ],
        programId: PROGRAM_ID,
        data: instructionData
      })
    );
    
    // Simulate the transaction to get detailed logs
    const isSimulationSuccessful = await simulateTransaction(tx, [payer]);
    
    return {
      success: isSimulationSuccessful,
      approach: "pda",
      pdaAddress: rafflePDA.toString(),
      timestamp
    };
  } catch (error) {
    console.error("Error in PDA test:", error);
    return { success: false, approach: "pda", error: error.message };
  }
}

// Function to view the config account
async function viewConfig() {
  try {
    const [configPDA, _] = await PublicKey.findProgramAddress(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    
    console.log("\n=== Config Account ===");
    console.log("Config Address:", configPDA.toString());
    
    const configAccount = await connection.getAccountInfo(configPDA);
    
    if (configAccount) {
      console.log("Account exists!");
      console.log("Owner:", configAccount.owner.toString());
      console.log("Data size:", configAccount.data.length, "bytes");
      
      // Print the raw data
      console.log("Raw data (hex):", Buffer.from(configAccount.data).toString('hex'));
      
      // Try to parse some of the data
      const isInitialized = configAccount.data[0] === 1;
      console.log("Is initialized:", isInitialized);
      
      // Admin pubkey is the next 32 bytes
      const adminPubkey = new PublicKey(configAccount.data.slice(1, 33));
      console.log("Admin:", adminPubkey.toString());
      
      // Treasury pubkey is the next 32 bytes
      const treasuryPubkey = new PublicKey(configAccount.data.slice(33, 65));
      console.log("Treasury:", treasuryPubkey.toString());
      
      // Ticket price is the next 8 bytes (little-endian u64)
      const ticketPrice = configAccount.data.readBigUInt64LE(65);
      console.log("Ticket price:", Number(ticketPrice) / 1_000_000_000, "SOL");
      
      // Fee basis points is the next 2 bytes (little-endian u16)
      const feeBasisPoints = configAccount.data.readUInt16LE(73);
      console.log("Fee basis points:", feeBasisPoints, "(" + (feeBasisPoints / 100) + "%)");
    } else {
      console.log("Config account not found!");
    }
    
    return configAccount !== null;
  } catch (error) {
    console.error("Error viewing config:", error);
    return false;
  }
}

// Run all tests
async function runTests() {
  // First check if config exists
  const configExists = await viewConfig();
  
  if (!configExists) {
    console.log("\nConfig does not exist! Please initialize it first.");
    return;
  }
  
  // Test the keypair approach
  const keypairResult = await testKeyPairRaffle();
  
  // Test the PDA approach
  const pdaResult = await testPDARaffle();
  
  // Summarize results
  console.log("\n=== Test Results ===");
  console.log("Keypair approach:", keypairResult.success ? "✅ WORKS" : "❌ FAILED");
  console.log("PDA approach:", pdaResult.success ? "✅ WORKS" : "❌ FAILED");
  
  // Recommend the best approach
  if (keypairResult.success) {
    console.log("\nRECOMMENDATION: Use the keypair approach for simplicity");
  } else if (pdaResult.success) {
    console.log("\nRECOMMENDATION: Use the PDA approach with timestamp", pdaResult.timestamp);
    console.log("PDA Address:", pdaResult.pdaAddress);
  } else {
    console.log("\nBoth approaches failed! You may need to inspect the contract code again.");
  }
}

// Run the tests
runTests()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

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

// Constants 
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');
const CONFIG_PDA = new PublicKey('B3r4z3rzEuUNGRyZEPfJBBgkyP2z3cSmFDfDR5vkQH7n');

// Admin wallet
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// This function tries to match Rust's i64::to_le_bytes() exactly
function i64ToLeBytesExact(timestamp) {
  // Handle the timestamp as BigInt to match Rust's i64
  const bigIntValue = BigInt(timestamp);
  
  // Create a buffer with 8 bytes (same as Rust's i64)
  const buffer = Buffer.alloc(8);
  
  // Write as little-endian (matches Rust's to_le_bytes)
  for (let i = 0; i < 8; i++) {
    const byte = Number((bigIntValue >> BigInt(i * 8)) & BigInt(0xff));
    buffer[i] = byte;
  }
  
  return buffer;
}

async function createRaffle() {
  try {
    console.log("=== Timestamp Encoding Test ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Authority:", payer.publicKey.toString());
    
    // Step 1: Use a hardcoded timestamp for testing
    // This helps eliminate variability with fetching from blockchain
    const timestamp = 1744444444; // Fixed timestamp for testing
    console.log("\n-> Using fixed timestamp:", timestamp);
    
    // Step 2: Create the title bytes (exact format from Rust)
    const title = "Test Raffle " + Date.now().toString().slice(-6);
    console.log("\n-> Creating title bytes...");
    console.log("  Title:", title);
    
    // In Rust, this is a fixed-size 32 byte array
    const titleBytes = Buffer.alloc(32, 0);
    Buffer.from(title).copy(titleBytes);
    console.log("  Title bytes length:", titleBytes.length);
    console.log("  Title bytes (hex):", titleBytes.toString('hex'));
    
    // Step 3: Convert timestamp to little-endian bytes (EXACT Rust match)
    console.log("\n-> Converting timestamp to little-endian bytes...");
    const timestampBuffer = i64ToLeBytesExact(timestamp);
    console.log("  Timestamp:", timestamp);
    console.log("  Timestamp bytes (hex):", timestampBuffer.toString('hex'));
    
    // Step 4: Find the PDA with the exact seeds from the contract
    console.log("\n-> Finding PDA with seeds...");
    const seeds = [
      Buffer.from("raffle"),
      payer.publicKey.toBuffer(),
      timestampBuffer,
      titleBytes
    ];
    
    console.log("  Seed 1 (prefix):", "raffle");
    console.log("  Seed 2 (authority):", payer.publicKey.toString());
    console.log("  Seed 3 (timestamp):", timestamp);
    console.log("  Seed 4 (title):", title);
    
    const [rafflePda, bump] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);
    console.log("\n-> PDA Result:");
    console.log("  Raffle PDA:", rafflePda.toString());
    console.log("  Bump seed:", bump);
    
    // Step 5: Create the transaction to initialize the raffle
    console.log("\n-> Creating transaction...");
    const duration = 300; // 5 minutes
    
    // Create instruction data - exactly as expected by the contract
    // Instruction 1 = initialize_raffle
    const instructionData = Buffer.alloc(41);
    instructionData.writeUInt8(1, 0); // Instruction ID = 1
    titleBytes.copy(instructionData, 1); // Title (32 bytes)
    instructionData.writeBigUInt64LE(BigInt(duration), 33); // Duration (8 bytes)
    
    // Create transaction instruction with exact account order from contract
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // authority
        { pubkey: rafflePda, isSigner: false, isWritable: true }, // raffle_info
        { pubkey: CONFIG_PDA, isSigner: false, isWritable: false }, // config_info
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false } // clock_info
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    // Create the transaction
    const transaction = new Transaction().add(instruction);
    
    // Step 6: Send the transaction
    console.log("\n-> Sending transaction...");
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer]
    );
    
    console.log("  ✅ Transaction successful!");
    console.log("  Signature:", signature);
    console.log("  View on Explorer: https://explorer.solana.com/tx/" + signature + "?cluster=devnet");
    
    // Step 7: Verify the raffle account was created
    console.log("\n-> Verifying raffle account creation...");
    const raffleAccount = await connection.getAccountInfo(rafflePda);
    
    if (raffleAccount) {
      console.log("  ✅ Raffle account exists!");
      console.log("  Owner:", raffleAccount.owner.toString());
      console.log("  Data size:", raffleAccount.data.length, "bytes");
      return true;
    } else {
      console.log("  ❌ Raffle account not found!");
      return false;
    }
    
  } catch (error) {
    console.error("Error:", error);
    
    if (error.logs) {
      console.error("\nTransaction logs:");
      error.logs.forEach((log, i) => console.error(`  ${i}: ${log}`));
    }
    
    return false;
  }
}

// Run the test
createRaffle()
  .then(success => {
    if (success) {
      console.log("\n=== TEST SUCCESSFUL! ===");
      console.log("The raffle was created successfully with the correct PDA.");
    } else {
      console.log("\n=== TEST FAILED ===");
      console.log("Unable to create the raffle with the derived PDA.");
    }
    process.exit(0);
  })
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

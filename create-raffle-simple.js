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

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Config PDA (verified from previous tests)
const CONFIG_PDA = new PublicKey('B3r4z3rzEuUNGRyZEPfJBBgkyP2z3cSmFDfDR5vkQH7n');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

/**
 * Utility function to convert a number to a little-endian byte array
 * This mimics Rust's to_le_bytes() for i64
 */
function i64ToLeBytes(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value), 0);
  return buffer;
}

/**
 * Create a fixed-length buffer from a string
 */
function createFixedLengthString(str, length) {
  const buffer = Buffer.alloc(length, 0);
  const strBuffer = Buffer.from(str);
  strBuffer.copy(buffer, 0, 0, Math.min(strBuffer.length, length));
  return buffer;
}

/**
 * Create a raffle with basic parameters
 */
async function createRaffle() {
  try {
    console.log("=== Creating New Raffle ===");
    console.log("Authority (Admin):", payer.publicKey.toString());
    
    // First, we need to get the current blockchain time
    const slot = await connection.getSlot('confirmed');
    const timestamp = await connection.getBlockTime(slot);
    console.log("Current blockchain time:", timestamp);
    
    if (!timestamp) {
      throw new Error("Failed to get blockchain timestamp");
    }
    
    // Basic raffle parameters
    const title = "Test Raffle " + Date.now().toString().substring(9);
    const titleBuffer = createFixedLengthString(title, 32);
    const duration = 300; // 5 minutes in seconds
    
    console.log("Title:", title);
    console.log("Duration:", duration, "seconds");
    
    // Create timestamp bytes in little-endian format to match Rust
    const timestampBytes = i64ToLeBytes(timestamp);
    console.log("Timestamp bytes:", Buffer.from(timestampBytes).toString('hex'));
    
    // Find the raffle PDA using the EXACT same seeds as in the contract
    const seeds = [
      Buffer.from("raffle"),
      payer.publicKey.toBuffer(),
      timestampBytes,
      titleBuffer
    ];
    
    const [rafflePDA, bump] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);
    console.log("Raffle PDA:", rafflePDA.toString(), "with bump:", bump);
    
    // Create the instruction data
    // Instruction 1 = Initialize Raffle
    const instructionData = Buffer.alloc(41);
    instructionData.writeUInt8(1, 0); // Instruction 1
    titleBuffer.copy(instructionData, 1);  // Title (32 bytes)
    instructionData.writeBigUInt64LE(BigInt(duration), 33); // Duration (u64, 8 bytes)
    
    // Create the transaction instruction
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: rafflePDA, isSigner: false, isWritable: true },
        { pubkey: CONFIG_PDA, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    // Create and sign transaction
    const tx = new Transaction().add(ix);
    
    console.log("Sending transaction...");
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer],
      {
        commitment: 'confirmed',
        skipPreflight: false
      }
    );
    
    console.log("Transaction sent! Signature:", signature);
    console.log("View on Explorer: https://explorer.solana.com/tx/" + signature + "?cluster=devnet");
    
    // Wait for confirmation
    console.log("Waiting for confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify the raffle account
    const raffleAccount = await connection.getAccountInfo(rafflePDA);
    
    if (raffleAccount) {
      console.log("✅ Raffle account created successfully!");
      console.log("- Owner:", raffleAccount.owner.toString());
      console.log("- Data size:", raffleAccount.data.length, "bytes");
      
      // Save raffle info for future tests
      const raffleInfo = {
        rafflePDA: rafflePDA.toString(),
        endTime: timestamp + duration,
        signature
      };
      
      return raffleInfo;
    } else {
      console.log("❌ Raffle account not found after transaction");
      return null;
    }
    
  } catch (error) {
    console.error("Error creating raffle:", error);
    
    // Log transaction logs if available
    if (error.logs) {
      console.error("Transaction logs:");
      error.logs.forEach((log, i) => console.error(`  ${i}: ${log}`));
    }
    
    return null;
  }
}

// Run the create raffle operation
createRaffle()
  .then(result => {
    if (result) {
      console.log("\n✅ RAFFLE CREATION SUCCESSFUL!");
      console.log("Raffle PDA:", result.rafflePDA);
      console.log("End time:", new Date(result.endTime * 1000).toLocaleString());
      
      // Save to file
      require('fs').writeFileSync('raffle-info.json', JSON.stringify(result, null, 2));
      console.log("Raffle info saved to raffle-info.json");
    } else {
      console.log("\n❌ RAFFLE CREATION FAILED");
    }
    process.exit(0);
  })
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

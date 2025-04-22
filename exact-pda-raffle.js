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
const BN = require('bn.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Config PDA
const CONFIG_PDA = new PublicKey('B3r4z3rzEuUNGRyZEPfJBBgkyP2z3cSmFDfDR5vkQH7n');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Function to convert number to LE bytes exactly like Rust's to_le_bytes for i64
function i64ToLeBytes(num) {
  const arr = new Uint8Array(8);
  const view = new DataView(arr.buffer);
  view.setBigInt64(0, BigInt(num), true); // true for little-endian
  return arr;
}

// Function to pad a string to a fixed length buffer
function stringToFixedBytes(str, length) {
  const buffer = Buffer.alloc(length, 0);
  const strBuffer = Buffer.from(str, 'utf8');
  strBuffer.copy(buffer, 0, 0, Math.min(strBuffer.length, length));
  return buffer;
}

async function createRaffle() {
  try {
    console.log("=== Creating Raffle with Exact PDA Derivation ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Wallet:", payer.publicKey.toString());
    console.log("Config PDA:", CONFIG_PDA.toString());
    
    // Setup basic raffle parameters
    const title = "Test Raffle " + Date.now().toString().slice(-6);
    const duration = 300; // 5 minutes in seconds
    
    console.log("Title:", title);
    console.log("Duration:", duration, "seconds");
    
    // First, we need to get the current blockchain time (Unix timestamp)
    console.log("Getting current blockchain time...");
    
    // Get recent slot
    const slot = await connection.getSlot('confirmed');
    console.log("Current slot:", slot);
    
    // Get timestamp for this slot
    const timestamp = await connection.getBlockTime(slot);
    console.log("Current blockchain time:", timestamp);
    
    if (!timestamp) {
      throw new Error("Failed to get blockchain timestamp");
    }
    
    // Convert the title to a fixed 32-byte array (exactly like in Rust)
    const titleBytes = stringToFixedBytes(title, 32);
    console.log("Title bytes length:", titleBytes.length);
    
    // Convert timestamp to little-endian bytes (exactly like Rust's to_le_bytes)
    const timestampBytes = i64ToLeBytes(timestamp);
    console.log("Timestamp bytes:", Buffer.from(timestampBytes).toString('hex'));
    
    // Find the PDA exactly as the contract does
    const seeds = [
      Buffer.from("raffle"),
      payer.publicKey.toBuffer(),
      Buffer.from(timestampBytes),
      titleBytes
    ];
    
    console.log("Seeds prepared:");
    console.log("- Prefix:", "raffle");
    console.log("- Authority:", payer.publicKey.toString());
    console.log("- Timestamp:", timestamp, "as bytes:", Buffer.from(timestampBytes).toString('hex'));
    console.log("- Title (truncated):", titleBytes.slice(0, 10).toString('hex') + "...");
    
    // Find the PDA
    const [rafflePda, bump] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);
    console.log("Derived Raffle PDA:", rafflePda.toString());
    console.log("Bump seed:", bump);
    
    // Create instruction data for initialize_raffle
    const instructionData = Buffer.alloc(41); // 1 byte for instruction + 32 bytes for title + 8 bytes for duration
    instructionData.writeUInt8(1, 0); // 1 = initialize_raffle instruction
    titleBytes.copy(instructionData, 1); // Copy title at offset 1
    instructionData.writeBigUInt64LE(BigInt(duration), 33); // Write duration at offset 33
    
    // Create the transaction instruction
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: rafflePda, isSigner: false, isWritable: true },
        { pubkey: CONFIG_PDA, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    console.log("Creating transaction...");
    const tx = new Transaction().add(ix);
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = payer.publicKey;
    
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
    
    console.log("Transaction successful!");
    console.log("Signature:", signature);
    console.log("Transaction link: https://explorer.solana.com/tx/" + signature + "?cluster=devnet");
    
    // Verify the raffle account was created
    console.log("Verifying raffle account creation...");
    const raffleAccount = await connection.getAccountInfo(rafflePda);
    
    if (raffleAccount) {
      console.log("✅ Raffle account verified!");
      console.log("- Owner:", raffleAccount.owner.toString());
      console.log("- Data size:", raffleAccount.data.length, "bytes");
      
      return {
        rafflePda: rafflePda.toString(),
        signature,
        endTime: timestamp + duration
      };
    } else {
      console.log("❌ Raffle account not found after transaction");
      return null;
    }
    
  } catch (error) {
    console.error("Error creating raffle:", error);
    
    // Display transaction logs if available
    if (error.logs) {
      console.error("Transaction logs:");
      error.logs.forEach((log, i) => console.error(`  ${i}: ${log}`));
    }
    
    return null;
  }
}

// Function to install bn.js if it's not already installed
async function ensureDependencies() {
  try {
    require('bn.js');
    console.log("bn.js is already installed.");
    return true;
  } catch (e) {
    console.log("Installing bn.js...");
    const { execSync } = require('child_process');
    try {
      execSync('npm install bn.js', { stdio: 'inherit' });
      console.log("bn.js installed successfully.");
      return true;
    } catch (error) {
      console.error("Failed to install bn.js:", error);
      return false;
    }
  }
}

// Run the test
ensureDependencies()
  .then(success => {
    if (!success) {
      console.error("Failed to ensure dependencies. Exiting.");
      process.exit(1);
    }
    return createRaffle();
  })
  .then(result => {
    if (result) {
      console.log("\n✅ RAFFLE CREATION SUCCESSFUL!");
      console.log("Raffle PDA:", result.rafflePda);
      console.log("End time:", new Date((result.endTime) * 1000).toLocaleString());
      
      // Save the result for future tests
      require('fs').writeFileSync('raffle-info.json', JSON.stringify(result, null, 2));
      console.log("Results saved to raffle-info.json");
    } else {
      console.log("\n❌ RAFFLE CREATION FAILED");
    }
    process.exit(0);
  })
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

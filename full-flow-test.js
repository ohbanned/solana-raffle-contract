const { 
  Connection, 
  PublicKey, 
  Keypair,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY
} = require('@solana/web3.js');

// Program ID (verified working)
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Config PDA (verified working)
const CONFIG_PDA = new PublicKey('B3r4z3rzEuUNGRyZEPfJBBgkyP2z3cSmFDfDR5vkQH7n');

// VRF account for randomness
const VRF_ACCOUNT = new PublicKey('2rZDG2KsCKfBWoJnPkYCbL8FCv9orReKTtTSL7hmRjak');

// Your wallet keypair (admin)
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Secondary test user
const testUser = Keypair.generate();

// Helius RPC endpoint (more reliable)
const connection = new Connection(
  'https://devnet.helius-rpc.com/?api-key=05614dbf-932c-4992-8c2c-e703c282ffc9',
  {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000 // 60 seconds
  }
);

// ============= HELPER FUNCTIONS =============

// Convert i64 to little-endian bytes (like Rust's to_le_bytes)
function i64ToLeBytes(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value), 0);
  return buffer;
}

// Convert string to fixed-length buffer
function stringToFixedLengthBytes(str, length) {
  const buffer = Buffer.alloc(length, 0);
  const strBuffer = Buffer.from(str);
  strBuffer.copy(buffer, 0, 0, Math.min(strBuffer.length, length));
  return buffer;
}

// Send transaction with retry logic
async function sendTxWithRetry(tx, signers, retries = 3, interval = 2000) {
  let lastError;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`Attempt ${attempt + 1}/${retries} to send transaction...`);
      
      // Get a fresh blockhash for each attempt
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = payer.publicKey;
      
      const signature = await sendAndConfirmTransaction(
        connection,
        tx,
        signers,
        {
          commitment: 'confirmed',
          skipPreflight: false
        }
      );
      
      console.log("Transaction successful! Signature:", signature);
      console.log("View on Explorer: https://explorer.solana.com/tx/" + signature + "?cluster=devnet");
      return signature;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
      
      if (error.logs) {
        console.error("Transaction logs:");
        error.logs.forEach((log, i) => console.error(`  ${i}: ${log}`));
      }
      
      lastError = error;
      
      if (attempt < retries - 1) {
        console.log(`Retrying in ${interval/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }
  
  throw lastError;
}

// ============= TEST STEPS =============

// 1. Fund the test user wallet
async function fundTestUser() {
  console.log("\n=== Step 1: Fund Test User Wallet ===");
  console.log("Test user:", testUser.publicKey.toString());
  
  try {
    // Create transfer instruction
    const transferAmount = 200_000_000; // 0.2 SOL
    
    const transferIx = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: testUser.publicKey,
      lamports: transferAmount
    });
    
    // Create and send transaction
    const tx = new Transaction().add(transferIx);
    const signature = await sendTxWithRetry(tx, [payer]);
    
    // Verify the transfer
    const balance = await connection.getBalance(testUser.publicKey);
    console.log("Test user balance:", balance / 1_000_000_000, "SOL");
    
    return { success: true, signature };
  } catch (error) {
    console.error("Failed to fund test user:", error);
    return { success: false, error };
  }
}

// 2. Verify config is set up correctly
async function verifyConfig() {
  console.log("\n=== Step 2: Verify Config ===");
  
  try {
    // Get config account info
    const configAccount = await connection.getAccountInfo(CONFIG_PDA);
    
    if (!configAccount) {
      console.log("❌ Config account not found!");
      return { success: false, error: "Config not found" };
    }
    
    console.log("✅ Config account exists!");
    console.log("- Owner:", configAccount.owner.toString());
    console.log("- Data size:", configAccount.data.length, "bytes");
    
    if (configAccount.data.length >= 75) {
      // Parse config data
      const isInitialized = configAccount.data[0] === 1;
      
      if (!isInitialized) {
        console.log("❌ Config is not initialized!");
        return { success: false, error: "Config not initialized" };
      }
      
      // Parse admin public key
      const adminPubkeyBytes = configAccount.data.slice(1, 33);
      const adminPubkey = new PublicKey(adminPubkeyBytes);
      
      // Parse treasury public key
      const treasuryPubkeyBytes = configAccount.data.slice(33, 65);
      const treasuryPubkey = new PublicKey(treasuryPubkeyBytes);
      
      // Parse ticket price
      const ticketPrice = configAccount.data.slice(65, 73).readBigUInt64LE();
      
      // Parse fee basis points
      const feeBasisPoints = configAccount.data.slice(73, 75).readUInt16LE();
      
      console.log("- Is initialized:", isInitialized);
      console.log("- Admin:", adminPubkey.toString());
      console.log("- Treasury:", treasuryPubkey.toString());
      console.log("- Ticket price:", ticketPrice.toString(), "lamports", "(" + (Number(ticketPrice) / 1_000_000_000) + " SOL)");
      console.log("- Fee:", feeBasisPoints / 100, "%");
      
      return { 
        success: true, 
        config: {
          isInitialized,
          admin: adminPubkey.toString(),
          treasury: treasuryPubkey.toString(),
          ticketPrice: ticketPrice.toString(),
          feeBasisPoints
        }
      };
    } else {
      console.log("❌ Config data too short to parse!");
      return { success: false, error: "Config data too short" };
    }
  } catch (error) {
    console.error("Failed to verify config:", error);
    return { success: false, error };
  }
}

// 3. Create a new raffle
async function createRaffle() {
  console.log("\n=== Step 3: Create Raffle ===");
  
  try {
    // Get current blockchain time
    const slot = await connection.getSlot('confirmed');
    const timestamp = await connection.getBlockTime(slot);
    console.log("Current blockchain time:", timestamp);
    
    if (!timestamp) {
      throw new Error("Failed to get blockchain timestamp");
    }
    
    // Raffle parameters
    const title = "Test Raffle " + Date.now().toString().substring(9);
    const titleBuffer = stringToFixedLengthBytes(title, 32);
    const duration = 60; // 1 minute for testing
    
    console.log("Raffle Title:", title);
    console.log("Duration:", duration, "seconds");
    
    // Create timestamp bytes for PDA derivation
    const timestampBytes = i64ToLeBytes(timestamp);
    
    // Find the raffle PDA
    const seeds = [
      Buffer.from("raffle"),
      payer.publicKey.toBuffer(),
      timestampBytes,
      titleBuffer
    ];
    
    const [rafflePDA, bump] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);
    console.log("Raffle PDA:", rafflePDA.toString(), "with bump:", bump);
    
    // Create instruction data (Instruction 1 = Initialize Raffle)
    const instructionData = Buffer.alloc(41);
    instructionData.writeUInt8(1, 0); // Instruction 1
    titleBuffer.copy(instructionData, 1);
    instructionData.writeBigUInt64LE(BigInt(duration), 33);
    
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
    
    // Send transaction
    const tx = new Transaction().add(ix);
    const signature = await sendTxWithRetry(tx, [payer]);
    
    // Verify raffle creation
    console.log("Verifying raffle account...");
    const raffleAccount = await connection.getAccountInfo(rafflePDA);
    
    if (raffleAccount) {
      console.log("✅ Raffle account created successfully!");
      console.log("- Owner:", raffleAccount.owner.toString());
      console.log("- Data size:", raffleAccount.data.length, "bytes");
      
      // Try to parse basic raffle data
      if (raffleAccount.data.length > 0) {
        const isInitialized = raffleAccount.data[0] === 1;
        console.log("- Is initialized:", isInitialized);
      }
      
      return {
        success: true,
        raffle: {
          pda: rafflePDA.toString(),
          endTime: timestamp + duration,
          title,
          signature
        }
      };
    } else {
      console.log("❌ Raffle account not found after transaction");
      return { success: false, error: "Raffle account not found" };
    }
  } catch (error) {
    console.error("Failed to create raffle:", error);
    return { success: false, error };
  }
}

// 4. Purchase tickets
async function purchaseTickets(rafflePDA, ticketCount) {
  console.log("\n=== Step 4: Purchase Tickets ===");
  console.log("Raffle PDA:", rafflePDA);
  console.log("User:", testUser.publicKey.toString());
  console.log("Ticket count:", ticketCount);
  
  try {
    // Get config to fetch ticket price
    const configResult = await verifyConfig();
    if (!configResult.success) {
      throw new Error("Could not verify config");
    }
    
    const ticketPrice = BigInt(configResult.config.ticketPrice);
    const totalCost = ticketPrice * BigInt(ticketCount);
    
    console.log("Ticket price:", ticketPrice.toString(), "lamports");
    console.log("Total cost:", totalCost.toString(), "lamports", "(" + (Number(totalCost) / 1_000_000_000) + " SOL)");
    
    // Create instruction data (Instruction 2 = Purchase Tickets)
    const instructionData = Buffer.alloc(9);
    instructionData.writeUInt8(2, 0); // Instruction 2 = Purchase Tickets
    instructionData.writeBigUInt64LE(BigInt(ticketCount), 1);
    
    // Raffle PDA
    const rafflePubkey = new PublicKey(rafflePDA);
    
    // Create the transaction instruction
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: testUser.publicKey, isSigner: true, isWritable: true },
        { pubkey: rafflePubkey, isSigner: false, isWritable: true },
        { pubkey: CONFIG_PDA, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    // Send transaction
    const tx = new Transaction().add(ix);
    const signature = await sendTxWithRetry(tx, [testUser]);
    
    // Verify the ticket purchase
    const balanceAfter = await connection.getBalance(testUser.publicKey);
    console.log("User balance after purchase:", balanceAfter / 1_000_000_000, "SOL");
    
    return {
      success: true,
      purchase: {
        user: testUser.publicKey.toString(),
        rafflePDA,
        ticketCount,
        totalCost: totalCost.toString(),
        signature
      }
    };
  } catch (error) {
    console.error("Failed to purchase tickets:", error);
    return { success: false, error };
  }
}

// 5. Complete raffle
async function completeRaffle(rafflePDA) {
  console.log("\n=== Step 5: Complete Raffle ===");
  console.log("Raffle PDA:", rafflePDA);
  
  try {
    // Create instruction data (Instruction 3 = Complete Raffle)
    const instructionData = Buffer.alloc(1);
    instructionData.writeUInt8(3, 0); // Instruction 3 = Complete Raffle
    
    // Raffle PDA
    const rafflePubkey = new PublicKey(rafflePDA);
    
    // Create the transaction instruction
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: rafflePubkey, isSigner: false, isWritable: true },
        { pubkey: VRF_ACCOUNT, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RECENT_BLOCKHASHES_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    // Send transaction
    const tx = new Transaction().add(ix);
    const signature = await sendTxWithRetry(tx, [payer]);
    
    // Verify the raffle completion
    const raffleAccount = await connection.getAccountInfo(new PublicKey(rafflePDA));
    
    if (raffleAccount) {
      console.log("✅ Raffle completion transaction successful!");
      
      // Try to parse winner information - this would require more detailed parsing
      console.log("- Data size:", raffleAccount.data.length, "bytes");
      console.log("- Note: Full parsing of winner would require more complex deserialization");
      
      return {
        success: true,
        completion: {
          rafflePDA,
          signature
        }
      };
    } else {
      console.log("❌ Raffle account not found after completion transaction");
      return { success: false, error: "Raffle account not found" };
    }
  } catch (error) {
    console.error("Failed to complete raffle:", error);
    return { success: false, error };
  }
}

// Run the full test flow
async function runFullTest() {
  console.log("=== FULL RAFFLE CONTRACT TEST ===");
  console.log("Admin:", payer.publicKey.toString());
  console.log("Program ID:", PROGRAM_ID.toString());
  console.log("Config PDA:", CONFIG_PDA.toString());
  console.log("VRF Account:", VRF_ACCOUNT.toString());
  
  // Keep track of results for each step
  const results = {};
  
  // Step 1: Fund test user
  results.fundTestUser = await fundTestUser();
  if (!results.fundTestUser.success) {
    console.log("❌ Step 1 failed. Stopping test.");
    return results;
  }
  
  // Step 2: Verify config
  results.verifyConfig = await verifyConfig();
  if (!results.verifyConfig.success) {
    console.log("❌ Step 2 failed. Stopping test.");
    return results;
  }
  
  // Step 3: Create raffle
  results.createRaffle = await createRaffle();
  if (!results.createRaffle.success) {
    console.log("❌ Step 3 failed. Stopping test.");
    return results;
  }
  
  // Step 4: Purchase tickets
  const rafflePDA = results.createRaffle.raffle.pda;
  results.purchaseTickets = await purchaseTickets(rafflePDA, 3);
  if (!results.purchaseTickets.success) {
    console.log("❌ Step 4 failed. Stopping test.");
    return results;
  }
  
  // Wait for raffle to be eligible for completion (duration was set to 60 seconds)
  console.log("\n=== Waiting for raffle duration to pass... ===");
  console.log("Waiting 65 seconds for raffle to be eligible for completion...");
  await new Promise(resolve => setTimeout(resolve, 65000));
  
  // Step 5: Complete raffle
  results.completeRaffle = await completeRaffle(rafflePDA);
  
  // Test summary
  console.log("\n=== TEST SUMMARY ===");
  console.log("1. Fund Test User: " + (results.fundTestUser.success ? "✅ SUCCESS" : "❌ FAILED"));
  console.log("2. Verify Config: " + (results.verifyConfig.success ? "✅ SUCCESS" : "❌ FAILED"));
  console.log("3. Create Raffle: " + (results.createRaffle.success ? "✅ SUCCESS" : "❌ FAILED"));
  console.log("4. Purchase Tickets: " + (results.purchaseTickets.success ? "✅ SUCCESS" : "❌ FAILED"));
  console.log("5. Complete Raffle: " + (results.completeRaffle?.success ? "✅ SUCCESS" : "❌ FAILED"));
  
  return results;
}

// Run the test
runFullTest()
  .then(results => {
    console.log("\n=== TEST COMPLETED ===");
    
    // Save results to file for reference
    const fs = require('fs');
    fs.writeFileSync('test-results.json', JSON.stringify(results, null, 2));
    console.log("Test results saved to test-results.json");
    
    process.exit(0);
  })
  .catch(err => {
    console.error("Fatal error running tests:", err);
    process.exit(1);
  });

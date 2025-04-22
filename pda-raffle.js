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

// Config PDA
const CONFIG_PDA = new PublicKey('B3r4z3rzEuUNGRyZEPfJBBgkyP2z3cSmFDfDR5vkQH7n');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Create data buffer for instruction data - simplified
function createInitRaffleData(title, duration) {
  // 1 byte for instruction + 32 bytes for title + 8 bytes for duration
  const buffer = Buffer.alloc(41);
  
  // Instruction identifier (1 = InitializeRaffle)
  buffer.writeUInt8(1, 0);
  
  // Write title (32 bytes)
  const titleBytes = Buffer.from(title.padEnd(32).substring(0, 32));
  titleBytes.copy(buffer, 1);
  
  // Write duration (8 bytes)
  buffer.writeBigUInt64LE(BigInt(duration), 33);
  
  return buffer;
}

// A simple test to check if our contract works
async function testCreateRaffle() {
  try {
    console.log("=== Testing Raffle Creation ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Wallet:", payer.publicKey.toString());
    
    // Setup basic raffle parameters
    const title = "Test Raffle";
    const duration = 300; // 5 minutes
    
    console.log("Title:", title);
    console.log("Duration:", duration, "seconds");
    
    // First we need to get the current time from the blockchain
    // Create a dummy transaction to get a recent blockhash
    const dummyTx = new Transaction();
    
    // Get a recent blockhash and context
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    // Get current slot
    const slot = await connection.getSlot();
    
    // Get timestamp from slot
    const timestamp = await connection.getBlockTime(slot);
    console.log("Current blockchain time:", timestamp);
    
    // The exact seeds used in the contract
    const seeds = [
      Buffer.from("raffle"),
      payer.publicKey.toBuffer(),
      Buffer.from(new Uint8Array(new BigInt64Array([BigInt(timestamp)]).buffer)), // Convert to LE bytes as in Rust
      Buffer.from(title.padEnd(32).substring(0, 32))
    ];
    
    // Find the PDA
    const [rafflePda, bump] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);
    console.log("Derived Raffle PDA:", rafflePda.toString(), "with bump:", bump);
    
    // Create the initialization data
    const instructionData = createInitRaffleData(title, duration);
    
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
    
    // Create and send the transaction
    const tx = new Transaction().add(ix);
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    
    console.log("Sending transaction...");
    
    // Sign and send
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer]
    );
    
    console.log("Transaction sent! Signature:", signature);
    
    // Verify the raffle was created
    const raffleInfo = await connection.getAccountInfo(rafflePda);
    
    if (raffleInfo) {
      console.log("✅ Raffle created successfully!");
      console.log("  Owner:", raffleInfo.owner.toString());
      console.log("  Data size:", raffleInfo.data.length, "bytes");
      
      return {
        rafflePda: rafflePda.toString(),
        endTime: timestamp + duration
      };
    } else {
      console.log("❌ Raffle account not found after transaction");
      return null;
    }
    
  } catch (error) {
    console.error("Error testing raffle creation:", error);
    
    // Display transaction logs if available
    if (error.logs) {
      console.error("Transaction logs:");
      error.logs.forEach((log, i) => console.error(`  ${i}: ${log}`));
    }
    
    return null;
  }
}

// Run the test
testCreateRaffle()
  .then(result => {
    if (result) {
      console.log("\n✅ TEST SUCCESSFUL!");
      console.log("Raffle PDA:", result.rafflePda);
      console.log("End time:", new Date(result.endTime * 1000).toLocaleString());
      
      // Save the result for future tests
      require('fs').writeFileSync('raffle-info.json', JSON.stringify(result, null, 2));
      console.log("Results saved to raffle-info.json");
    } else {
      console.log("\n❌ TEST FAILED");
    }
    process.exit(0);
  })
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

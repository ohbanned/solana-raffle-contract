const { 
  Connection, 
  PublicKey, 
  Keypair,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram
} = require('@solana/web3.js');

// Program ID (already deployed)
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet with increased timeout
const connection = new Connection(
  'https://api.devnet.solana.com', 
  { 
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000 // 60 seconds
  }
);

async function initializeConfig() {
  try {
    console.log("=== Initializing Config ===");
    console.log("Admin:", payer.publicKey.toString());
    
    // Derive the config PDA
    const [configPDA, bump] = await PublicKey.findProgramAddress(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    console.log("Config PDA:", configPDA.toString(), "with bump:", bump);
    
    // Use the admin's wallet as the treasury for simplicity
    // In production, this would be a separate account
    const treasuryAccount = payer.publicKey;
    console.log("Treasury:", treasuryAccount.toString());
    
    // Set config values
    const ticketPrice = 100_000_000; // 0.1 SOL in lamports
    const feeBasisPoints = 1000; // 10% fee (basis points are 1/100 of a percent)
    
    console.log("Setting ticket price to:", ticketPrice, "lamports (", ticketPrice / 1_000_000_000, "SOL)");
    console.log("Setting fee to:", feeBasisPoints / 100, "%");
    
    // Create instruction data for InitializeConfig (instruction 0)
    const instructionData = Buffer.alloc(11);
    instructionData.writeUInt8(0, 0); // Instruction 0 = Initialize Config
    instructionData.writeBigUInt64LE(BigInt(ticketPrice), 1); // Ticket price at offset 1
    instructionData.writeUInt16LE(feeBasisPoints, 9); // Fee basis points at offset 9
    
    // Create transaction instruction
    // IMPORTANT: Include ALL required accounts in the correct order!
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // Admin
        { pubkey: configPDA, isSigner: false, isWritable: true }, // Config PDA
        { pubkey: treasuryAccount, isSigner: false, isWritable: false }, // Treasury
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false } // System Program
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    // Create and sign transaction
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
    
    console.log("Transaction submitted! Signature:", signature);
    console.log("View on Solana Explorer: https://explorer.solana.com/tx/" + signature + "?cluster=devnet");
    
    // Wait a moment for the transaction to be confirmed
    console.log("Waiting for confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify the config was initialized
    console.log("Verifying config account...");
    const configAccount = await connection.getAccountInfo(configPDA);
    
    if (configAccount) {
      console.log("✅ Config account exists!");
      console.log("- Owner:", configAccount.owner.toString());
      console.log("- Data size:", configAccount.data.length, "bytes");
      
      // Try to parse some of the data
      if (configAccount.data.length > 0) {
        const isInitialized = configAccount.data[0] === 1;
        console.log("- Is initialized:", isInitialized);
        
        if (configAccount.data.length >= 9) {
          try {
            const price = configAccount.data.slice(1, 9).readBigUInt64LE();
            console.log("- Ticket price:", price.toString(), "lamports");
          } catch (e) {
            console.log("- Could not parse ticket price");
          }
        }
      }
      
      return {
        configPDA: configPDA.toString(),
        ticketPrice: ticketPrice.toString(),
        feeBasisPoints
      };
    } else {
      console.log("❌ Config account not found after transaction");
      return null;
    }
    
  } catch (error) {
    console.error("Error initializing config:", error);
    
    // Display transaction logs if available
    if (error.logs) {
      console.error("Transaction logs:");
      error.logs.forEach((log, i) => console.error(`  ${i}: ${log}`));
    }
    
    return null;
  }
}

// Run the initialize config operation
initializeConfig()
  .then(result => {
    if (result) {
      console.log("\n✅ CONFIG INITIALIZATION SUCCESSFUL!");
      
      // Save config info to file for future tests
      const configInfo = {
        configPDA: result.configPDA,
        ticketPrice: result.ticketPrice,
        feeBasisPoints: result.feeBasisPoints
      };
      
      require('fs').writeFileSync('config-info.json', JSON.stringify(configInfo, null, 2));
      console.log("Config info saved to config-info.json");
    } else {
      console.log("\n❌ CONFIG INITIALIZATION FAILED");
    }
    process.exit(0);
  })
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

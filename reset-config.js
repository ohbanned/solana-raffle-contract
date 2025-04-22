const { 
  Connection, 
  PublicKey, 
  Keypair,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction 
} = require('@solana/web3.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function deriveConfigPDA() {
  // For config, we use a simple seed - just the string "config"
  const [configPDA, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("config")],
    PROGRAM_ID
  );
  
  return { configPDA, bump };
}

async function initializeConfig() {
  try {
    // Get the config PDA
    const { configPDA, bump } = await deriveConfigPDA();
    console.log("Config PDA:", configPDA.toString(), "with bump:", bump);
    
    // Check if the account already exists
    const configAccount = await connection.getAccountInfo(configPDA);
    const accountExists = configAccount !== null;
    
    console.log("Config account exists:", accountExists);
    
    // Set reasonable default values
    const ticketPrice = 100_000_000; // 0.1 SOL in lamports
    const feeBasisPoints = 1000; // 10% fee (basis points are 1/100 of a percent)
    
    console.log("Setting ticket price to:", ticketPrice, "lamports (", ticketPrice / 1_000_000_000, "SOL)");
    console.log("Setting fee to:", feeBasisPoints / 100, "%");
    
    // Instruction 0 = Initialize Config in the contract
    const instructionData = Buffer.alloc(11);
    instructionData.writeUInt8(0, 0); // Instruction 0 = Initialize Config
    instructionData.writeBigUInt64LE(BigInt(ticketPrice), 1); // Ticket price at offset 1
    instructionData.writeUInt16LE(feeBasisPoints, 9); // Fee basis points at offset 9
    
    // Create transaction instruction for updating config
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: configPDA, isSigner: false, isWritable: true }
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
    
    // Verify the config was initialized or updated
    const updatedConfigAccount = await connection.getAccountInfo(configPDA);
    
    if (updatedConfigAccount) {
      console.log("✅ Config account verified!");
      console.log("- Owner:", updatedConfigAccount.owner.toString());
      console.log("- Data size:", updatedConfigAccount.data.length, "bytes");
      
      return {
        configPDA: configPDA.toString(),
        ticketPrice,
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
      console.log("Config PDA:", result.configPDA);
      console.log("Ticket Price:", result.ticketPrice, "lamports");
      console.log("Fee Basis Points:", result.feeBasisPoints);
      
      // Save to JSON file as a string representation
      const configInfo = {
        configPDA: result.configPDA,
        ticketPrice: result.ticketPrice.toString(),
        feeBasisPoints: result.feeBasisPoints
      };
      
      require('fs').writeFileSync('config-info.json', JSON.stringify(configInfo, null, 2));
      console.log("Results saved to config-info.json");
    } else {
      console.log("\n❌ CONFIG INITIALIZATION FAILED");
    }
    process.exit(0);
  })
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

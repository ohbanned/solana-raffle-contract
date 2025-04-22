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

// Latest Contract ID
const PROGRAM_ID = new PublicKey('4Td2GDc3fAySA7wrCA89TeKea2sKfT1T6jyogvxDmBbw');

// Use Helius RPC for better reliability
const connection = new Connection('https://devnet.helius-rpc.com/?api-key=05614dbf-932c-4992-8c2c-e703c282ffc9', 'confirmed');

// Admin wallet
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

async function createRaffleWithPDA() {
  try {
    // Find config PDA for this program
    const [configPDA, _] = await PublicKey.findProgramAddress(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    
    console.log("=== Creating Raffle with PDA ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Config PDA:", configPDA.toString());
    console.log("Creator:", payer.publicKey.toString());
    
    // Create raffle parameters
    const title = "Test Raffle";
    const titleBuffer = Buffer.alloc(32, 0);
    Buffer.from(title).copy(titleBuffer);
    const duration = 300; // 5 minutes
    
    console.log("\n-> Raffle parameters:");
    console.log("  Title:", title);
    console.log("  Duration:", duration, "seconds");
    
    // Get current time for seed derivation
    const timestamp = Math.floor(Date.now() / 1000);
    const timestampBytes = Buffer.alloc(8);
    timestampBytes.writeBigInt64LE(BigInt(timestamp), 0);
    console.log("  Current timestamp:", timestamp);
    
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
    
    console.log("\n-> Derived Raffle PDA:");
    console.log("  Address:", rafflePDA.toString());
    console.log("  Bump seed:", raffleBump);
    
    // Create initialize raffle instruction data
    const instructionData = Buffer.alloc(41);
    instructionData.writeUInt8(1, 0); // Instruction 1 = Initialize Raffle
    titleBuffer.copy(instructionData, 1); // Title (32 bytes)
    instructionData.writeBigUInt64LE(BigInt(duration), 33); // Duration (8 bytes)
    
    // Create initialize raffle instruction
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: rafflePDA, isSigner: false, isWritable: true },
        { pubkey: configPDA, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    // Create and send transaction
    const tx = new Transaction().add(ix);
    
    console.log("\n-> Sending transaction...");
    
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer],
      {
        commitment: 'confirmed',
        skipPreflight: false,
        maxRetries: 5
      }
    );
    
    console.log("  Transaction sent! Signature:", signature);
    console.log("  View on Explorer: https://explorer.solana.com/tx/" + signature + "?cluster=devnet");
    
    // Verify the raffle account was created
    console.log("\n-> Verifying raffle account creation...");
    const raffleAccount = await connection.getAccountInfo(rafflePDA);
    
    if (raffleAccount) {
      console.log("  ✅ Raffle account exists!");
      console.log("  Owner:", raffleAccount.owner.toString());
      console.log("  Data size:", raffleAccount.data.length, "bytes");
      
      return {
        success: true,
        raffleAddress: rafflePDA.toString(),
        signature
      };
    } else {
      console.log("  ❌ Raffle account not found!");
      return {
        success: false,
        error: "Raffle account not found after transaction"
      };
    }
    
  } catch (error) {
    console.error("Error creating raffle:", error);
    
    if (error.logs) {
      console.error("\nTransaction logs:");
      error.logs.forEach((log, i) => console.error(`  ${i}: ${log}`));
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
createRaffleWithPDA()
  .then(result => {
    if (result.success) {
      console.log("\n=== RAFFLE CREATION SUCCESSFUL! ===");
      console.log("Raffle address:", result.raffleAddress);
      console.log("Transaction signature:", result.signature);
      
      // Save raffle info for future tests
      require('fs').writeFileSync('working-raffle-info.json', JSON.stringify(result, null, 2));
      console.log("Raffle info saved to working-raffle-info.json");
    } else {
      console.log("\n=== RAFFLE CREATION FAILED ===");
      console.log("Error:", result.error);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

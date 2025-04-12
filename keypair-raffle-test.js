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

/**
 * Create a raffle using a keypair approach
 */
async function createRaffleWithKeypair() {
  try {
    console.log("=== Creating Raffle with Keypair ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Admin:", payer.publicKey.toString());
    
    // 1. Generate a new keypair for the raffle account
    const raffleKeypair = Keypair.generate();
    console.log("\n-> Generated new raffle keypair:");
    console.log("  Public key:", raffleKeypair.publicKey.toString());
    
    // 2. Create raffle parameters
    const title = "Test Raffle";
    const titleBuffer = Buffer.alloc(32, 0);
    Buffer.from(title).copy(titleBuffer);
    const duration = 300; // 5 minutes
    
    console.log("\n-> Raffle parameters:");
    console.log("  Title:", title);
    console.log("  Duration:", duration, "seconds");
    
    // 3. Calculate space needed for the raffle account
    const RAFFLE_ACCOUNT_SIZE = 1 + 32 + 32 + 8 + 1 + 32 + 8 + 2 + 32 + 32 + 1;
    console.log("  Account size:", RAFFLE_ACCOUNT_SIZE, "bytes");
    
    // 4. Calculate rent exemption amount
    const rentExemption = await connection.getMinimumBalanceForRentExemption(RAFFLE_ACCOUNT_SIZE);
    console.log("  Rent exemption:", rentExemption / 1_000_000_000, "SOL");
    
    // 5. Create account instruction
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: raffleKeypair.publicKey,
      lamports: rentExemption,
      space: RAFFLE_ACCOUNT_SIZE,
      programId: PROGRAM_ID
    });
    
    // 6. Create initialize raffle instruction data
    const instructionData = Buffer.alloc(41);
    instructionData.writeUInt8(1, 0); // Instruction 1 = Initialize Raffle
    titleBuffer.copy(instructionData, 1); // Title (32 bytes)
    instructionData.writeBigUInt64LE(BigInt(duration), 33); // Duration (8 bytes)
    
    // 7. Create initialize raffle instruction
    const initRaffleIx = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: raffleKeypair.publicKey, isSigner: false, isWritable: true },
        { pubkey: CONFIG_PDA, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    // 8. Combine instructions into a single transaction
    const transaction = new Transaction()
      .add(createAccountIx)
      .add(initRaffleIx);
    
    console.log("\n-> Sending transaction...");
    
    // 9. Send and confirm the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, raffleKeypair], // Both keypairs need to sign
      {
        commitment: 'confirmed',
        skipPreflight: false
      }
    );
    
    console.log("  Transaction sent! Signature:", signature);
    console.log("  View on Explorer: https://explorer.solana.com/tx/" + signature + "?cluster=devnet");
    
    // 10. Verify the raffle account was created
    console.log("\n-> Verifying raffle account creation...");
    const raffleAccount = await connection.getAccountInfo(raffleKeypair.publicKey);
    
    if (raffleAccount) {
      console.log("  ✅ Raffle account exists!");
      console.log("  Owner:", raffleAccount.owner.toString());
      console.log("  Data size:", raffleAccount.data.length, "bytes");
      
      // Basic parsing of raffle data
      if (raffleAccount.data.length > 0) {
        const isInitialized = raffleAccount.data[0] === 1;
        console.log("  Is initialized:", isInitialized);
      }
      
      return {
        success: true,
        raffleAddress: raffleKeypair.publicKey.toString(),
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
createRaffleWithKeypair()
  .then(result => {
    if (result.success) {
      console.log("\n=== RAFFLE CREATION SUCCESSFUL! ===");
      console.log("Raffle address:", result.raffleAddress);
      console.log("Transaction signature:", result.signature);
      
      // Save raffle info for future tests
      require('fs').writeFileSync('raffle-info.json', JSON.stringify(result, null, 2));
      console.log("Raffle info saved to raffle-info.json");
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

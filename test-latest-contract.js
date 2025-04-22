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

async function initializeConfig() {
  try {
    console.log("=== Initializing Config with Latest Contract ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Admin:", payer.publicKey.toString());
    
    // 1. Find the config PDA
    const [configPDA, configBump] = await PublicKey.findProgramAddress(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    console.log("Config PDA:", configPDA.toString());
    
    // 2. Initialize config parameters
    const ticketPrice = 100_000_000; // 0.1 SOL
    const feeBasisPoints = 500; // 5%
    
    console.log("\n-> Config parameters:");
    console.log("  Ticket price:", ticketPrice / 1_000_000_000, "SOL");
    console.log("  Fee:", feeBasisPoints / 100, "%");
    
    // 3. Create treasury account
    const treasuryKeypair = Keypair.generate();
    console.log("  Treasury:", treasuryKeypair.publicKey.toString());
    
    // 4. Create instruction data
    const instructionData = Buffer.alloc(11);
    instructionData.writeUInt8(0, 0); // Instruction 0 = InitializeConfig
    instructionData.writeBigUInt64LE(BigInt(ticketPrice), 1); // Ticket price (8 bytes)
    instructionData.writeUInt16LE(feeBasisPoints, 9); // Fee basis points (2 bytes)
    
    // 5. Create instruction
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: configPDA, isSigner: false, isWritable: true },
        { pubkey: treasuryKeypair.publicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId: PROGRAM_ID,
      data: instructionData
    });
    
    // 6. Create and send transaction
    const tx = new Transaction().add(ix);
    
    console.log("\n-> Sending transaction...");
    
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer],
      {
        commitment: 'confirmed',
        skipPreflight: false
      }
    );
    
    console.log("  Transaction sent! Signature:", signature);
    console.log("  View on Explorer: https://explorer.solana.com/tx/" + signature + "?cluster=devnet");
    
    return {
      success: true,
      configAddress: configPDA.toString(),
      signature,
      treasuryAddress: treasuryKeypair.publicKey.toString()
    };
    
  } catch (error) {
    console.error("Error initializing config:", error);
    
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

async function createRaffleWithKeypair() {
  try {
    // First, find the config PDA for this program ID
    const [configPDA, _] = await PublicKey.findProgramAddress(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    
    console.log("=== Creating Raffle with Keypair ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Config PDA:", configPDA.toString());
    console.log("Creator:", payer.publicKey.toString());
    
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
    const RAFFLE_ACCOUNT_SIZE = 1 + 32 + 32 + 8 + 8 + 1 + 32 + 8 + 2 + 32 + 32 + 1 + 1;
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
        { pubkey: configPDA, isSigner: false, isWritable: false },
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

// Check if config exists first, otherwise initialize it
async function checkConfig() {
  try {
    const [configPDA, _] = await PublicKey.findProgramAddress(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    
    console.log("Checking if config exists at:", configPDA.toString());
    
    const configAccount = await connection.getAccountInfo(configPDA);
    
    if (configAccount && configAccount.owner.equals(PROGRAM_ID)) {
      console.log("✅ Config account exists and is owned by the program");
      return true;
    } else {
      console.log("❌ Config account doesn't exist or isn't owned by the program");
      return false;
    }
  } catch (error) {
    console.error("Error checking config:", error);
    return false;
  }
}

// Main function
async function main() {
  // Check if config exists
  const configExists = await checkConfig();
  
  // If config doesn't exist, initialize it
  if (!configExists) {
    console.log("\nConfig doesn't exist, initializing...");
    const initResult = await initializeConfig();
    
    if (!initResult.success) {
      console.log("Failed to initialize config. Exiting.");
      return;
    }
    
    console.log("\nConfig initialized successfully!");
  }
  
  // Create a raffle with keypair
  console.log("\nCreating raffle...");
  const raffleResult = await createRaffleWithKeypair();
  
  if (raffleResult.success) {
    console.log("\n=== RAFFLE CREATION SUCCESSFUL! ===");
    console.log("Raffle address:", raffleResult.raffleAddress);
    console.log("Transaction signature:", raffleResult.signature);
    
    // Save raffle info for future reference
    require('fs').writeFileSync('latest-raffle-info.json', JSON.stringify(raffleResult, null, 2));
    console.log("Raffle info saved to latest-raffle-info.json");
  } else {
    console.log("\n=== RAFFLE CREATION FAILED ===");
    console.log("Error:", raffleResult.error);
  }
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

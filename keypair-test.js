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

// Function to demonstrate creating a raffle with keypair
async function createRaffleWithKeypair() {
  try {
    console.log("=== Keypair Approach Demonstration ===");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Admin:", payer.publicKey.toString());
    
    // With a keypair approach, we would:
    // 1. Generate a new keypair for the raffle
    const raffleKeypair = Keypair.generate();
    console.log("\n-> Generated new raffle keypair:");
    console.log("  Raffle public key:", raffleKeypair.publicKey.toString());
    
    // 2. Calculate space required for raffle account
    const RAFFLE_ACCOUNT_SIZE = 1 + 32 + 32 + 8 + 1 + 32 + 8 + 2 + 32 + 32 + 1;
    console.log("  Estimated account size:", RAFFLE_ACCOUNT_SIZE, "bytes");
    
    // 3. Calculate rent exemption
    const rentExemption = await connection.getMinimumBalanceForRentExemption(RAFFLE_ACCOUNT_SIZE);
    console.log("  Rent exemption:", rentExemption / 1_000_000_000, "SOL");
    
    // 4. Create transaction to:
    //    a) Create the account
    //    b) Initialize the raffle
    
    // Setting raffle parameters
    const title = "Test Raffle";
    const titleBuffer = Buffer.alloc(32, 0);
    Buffer.from(title).copy(titleBuffer);
    const duration = 300; // 5 minutes
    
    console.log("\n-> Raffle parameters:");
    console.log("  Title:", title);
    console.log("  Duration:", duration, "seconds");
    
    // Create account instruction
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: raffleKeypair.publicKey,
      lamports: rentExemption,
      space: RAFFLE_ACCOUNT_SIZE,
      programId: PROGRAM_ID
    });
    
    // Create initialize instruction data
    const instructionData = Buffer.alloc(41);
    instructionData.writeUInt8(1, 0); // Instruction 1 = Initialize Raffle
    titleBuffer.copy(instructionData, 1); // Title (32 bytes)
    instructionData.writeBigUInt64LE(BigInt(duration), 33); // Duration (8 bytes)
    
    // Initialize raffle instruction
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
    
    // Combine into single transaction
    const transaction = new Transaction()
      .add(createAccountIx)
      .add(initRaffleIx);
    
    // For demonstration, we're not actually sending this transaction
    // But in a real implementation, we would:
    console.log("\n-> If we were to send this transaction:");
    console.log("  1. Create account at address:", raffleKeypair.publicKey.toString());
    console.log("  2. Initialize raffle with title:", title);
    console.log("  3. Set duration to:", duration, "seconds");
    
    // The keypair approach would require these changes to the contract:
    console.log("\n-> Required contract changes:");
    console.log("  1. Remove PDA derivation and validation in process_initialize_raffle");
    console.log("  2. Accept any account owned by the program as the raffle account");
    console.log("  3. Trust that the account is properly initialized via createAccount");
    
    return {
      raffleKeypair,
      transaction
    };
    
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

// Run the keypair demonstration
createRaffleWithKeypair()
  .then(result => {
    if (result) {
      console.log("\n=== KEYPAIR APPROACH SUMMARY ===");
      console.log("The keypair approach is simpler but requires contract modifications.");
      console.log("It would eliminate the PDA derivation issues we're facing.");
      console.log("To implement this, we would need to:");
      console.log("1. Modify the contract to accept keypair-created accounts");
      console.log("2. Rebuild and redeploy the contract");
      console.log("3. Update client code to use keypairs instead of PDAs");
    } else {
      console.log("\n=== DEMONSTRATION FAILED ===");
    }
    process.exit(0);
  })
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

const { Connection, PublicKey, Keypair, TransactionInstruction, Transaction, sendAndConfirmTransaction, SystemProgram, SYSVAR_CLOCK_PUBKEY } = require('@solana/web3.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Config PDA (confirmed from previous test)
const CONFIG_PDA = new PublicKey('B3r4z3rzEuUNGRyZEPfJBBgkyP2z3cSmFDfDR5vkQH7n');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Simply use local timestamp - the contract will use its own on-chain timestamp anyway
const currentTime = Math.floor(Date.now() / 1000);

// Create a new keypair for the raffle - this bypasses the PDA derivation issues
const raffleKeypair = Keypair.generate();

async function createRaffle() {
  try {
    console.log("Creating new raffle with a generated keypair");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Wallet:", payer.publicKey.toString());
    console.log("Raffle Account:", raffleKeypair.publicKey.toString());
    
    // Generate raffle info
    const title = "SolCino Test " + Date.now();
    const duration = 300; // 5 minutes
    
    console.log("Title:", title);
    console.log("Duration:", duration, "seconds");
    
    // Prepare title buffer (32 bytes)
    const titleBuffer = Buffer.alloc(32);
    const tempTitleBuffer = Buffer.from(title);
    tempTitleBuffer.copy(titleBuffer, 0, 0, Math.min(tempTitleBuffer.length, 32));
    
    // Create instruction data for raffle creation (instruction 1 = InitializeRaffle)
    const instructionData = Buffer.alloc(41); // 1 byte for instruction + 32 bytes for title + 8 bytes for duration
    instructionData.writeUInt8(1, 0); // instruction 1 = InitializeRaffle
    titleBuffer.copy(instructionData, 1);
    instructionData.writeBigUInt64LE(BigInt(duration), 33);
    
    // Calculate the space required for the Raffle account
    const space = 1 + 32 + 32 + 8 + 1 + 32 + 8 + 2 + 32 + 32 + 1; // Approximately the size of Raffle struct
    
    // Calculate the rent-exempt balance
    const rentExemptBalance = await connection.getMinimumBalanceForRentExemption(space);
    
    console.log("Creating raffle account...");
    // Create account transaction
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: raffleKeypair.publicKey,
      lamports: rentExemptBalance,
      space: space,
      programId: PROGRAM_ID
    });
    
    // Initialize raffle transaction 
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
    
    // Create and send the transaction with both instructions
    const tx = new Transaction()
      .add(createAccountIx)
      .add(initRaffleIx);
    
    console.log("Sending transaction...");
    const txSignature = await sendAndConfirmTransaction(
      connection, 
      tx, 
      [payer, raffleKeypair]
    );
    
    console.log("Transaction sent! Signature:", txSignature);
    
    // Verify the raffle was created
    console.log("Verifying raffle creation...");
    const raffleInfo = await connection.getAccountInfo(raffleKeypair.publicKey);
    
    if (raffleInfo) {
      console.log("✅ Raffle account created successfully!");
      console.log("Raffle account owner:", raffleInfo.owner.toString());
      console.log("Raffle data size:", raffleInfo.data.length, "bytes");
      
      return {
        rafflePda: raffleKeypair.publicKey,
        endTime: currentTime + duration
      };
    } else {
      console.log("❌ Raffle account creation failed or account not found");
      return null;
    }
  } catch (error) {
    console.error("Error creating raffle:", error);
    return null;
  }
}

// Run the create raffle test
createRaffle().then(
  result => {
    if (result) {
      console.log("\n✅ RAFFLE CREATED SUCCESSFULLY!");
      console.log("Raffle address:", result.rafflePda.toString());
      console.log("End time:", new Date(result.endTime * 1000).toLocaleString());
      
      // Write the raffle info to a file so other tests can use it
      const fs = require('fs');
      fs.writeFileSync('./raffle-info.json', JSON.stringify({
        rafflePda: result.rafflePda.toString(),
        endTime: result.endTime
      }));
      
      console.log("Raffle info saved to raffle-info.json");
    }
    process.exit();
  },
  err => {
    console.error("Fatal error:", err);
    process.exit(-1);
  }
);

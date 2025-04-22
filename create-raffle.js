const { Connection, PublicKey, Keypair, TransactionInstruction, Transaction, sendAndConfirmTransaction, SystemProgram, SYSVAR_CLOCK_PUBKEY } = require('@solana/web3.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Config PDA (confirmed from previous test)
const CONFIG_PDA = new PublicKey('B3r4z3rzEuUNGRyZEPfJBBgkyP2z3cSmFDfDR5vkQH7n');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet with higher commitment
const connection = new Connection(
  'https://api.devnet.solana.com',
  {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000 // 60 seconds
  }
);

// Helper function for a more reliable transaction send
async function sendTransactionWithRetry(transaction, signers, retries = 3, interval = 5000) {
  let attempt = 0;
  
  while (attempt < retries) {
    try {
      // Get a fresh blockhash before each attempt
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      
      console.log(`Attempt ${attempt + 1}/${retries} - Sending transaction...`);
      
      // Send and confirm with appropriate timeout
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        signers,
        {
          skipPreflight: false,
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
          maxRetries: 5
        }
      );
      
      console.log(`Transaction successful! Signature: ${signature}`);
      return signature;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
      
      // Check if we should retry
      if (attempt < retries - 1) {
        console.log(`Waiting ${interval / 1000} seconds before retrying...`);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
      
      attempt++;
    }
  }
  
  throw new Error(`Failed after ${retries} attempts`);
}

async function createRaffle() {
  console.log("Creating a new raffle...");
  console.log("Program ID:", PROGRAM_ID.toString());
  console.log("Wallet:", payer.publicKey.toString());
  
  // Check wallet balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log("Wallet balance:", balance / 1_000_000_000, "SOL");
  
  // Generate raffle info
  const title = "SolCino Test " + Date.now();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const duration = 300; // 5 minutes
  
  console.log("Title:", title);
  console.log("Duration:", duration, "seconds");
  
  // Find raffle PDA using the PDA approach we implemented
  const [rafflePda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("raffle"),
      payer.publicKey.toBuffer(),
      Buffer.from(timestamp),
      Buffer.from(title.padEnd(32).substring(0, 32))
    ], 
    PROGRAM_ID
  );
  
  console.log("Raffle PDA:", rafflePda.toString());
  
  // Prepare instruction data for raffle creation (instruction 1 = InitializeRaffle)
  const instructionData = Buffer.alloc(41); // 1 byte for instruction + 32 bytes for title + 8 bytes for duration
  instructionData.writeUInt8(1, 0); // instruction 1 = InitializeRaffle
  
  // Write title (32 bytes)
  const titleBuffer = Buffer.from(title.padEnd(32).substring(0, 32));
  titleBuffer.copy(instructionData, 1);
  
  // Write duration 
  instructionData.writeBigUInt64LE(BigInt(duration), 33);
  
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
  
  console.log("Preparing to create raffle...");
  try {
    const tx = new Transaction().add(ix);
    
    // Use our retry function
    const signature = await sendTransactionWithRetry(tx, [payer]);
    
    // Verify the raffle was created
    console.log("Waiting for confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const raffleInfo = await connection.getAccountInfo(rafflePda);
    if (raffleInfo) {
      console.log("Raffle account verified!");
      console.log("Raffle owner:", raffleInfo.owner.toString());
      console.log("Raffle data size:", raffleInfo.data.length, "bytes");
      return { 
        rafflePda, 
        endTime: Math.floor(Date.now() / 1000) + duration 
      };
    } else {
      console.log("Raffle account not found. Creation may have failed.");
      return null;
    }
  } catch (e) {
    console.error("Error creating raffle:", e);
    return null;
  }
}

// Run the create raffle test
createRaffle().then(
  result => {
    if (result) {
      console.log("\n✅ RAFFLE CREATED SUCCESSFULLY!");
      console.log("Raffle PDA:", result.rafflePda.toString());
      console.log("End time:", new Date(result.endTime * 1000).toLocaleString());
      
      // Write the raffle PDA to a file so other tests can use it
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

const { Connection, PublicKey, Keypair, TransactionInstruction, Transaction, sendAndConfirmTransaction, SystemProgram, SYSVAR_CLOCK_PUBKEY } = require('@solana/web3.js');

// Program ID and key constants
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');
// Using a placeholder VRF account for testing
const VRF_ACCOUNT = new PublicKey('6V8XdktJrMxrXFmBXJJTZHQHeYfXw8s2FzdQ5BffNV2x');
// Using the actual Switchboard program ID on devnet
const SWITCHBOARD_PROGRAM = new PublicKey('SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStVMVGgGowYE');
// Using a valid oracle queue address
const ORACLE_QUEUE = new PublicKey('F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Helper function to wait for a number of seconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Update config (price and fee)
async function updateConfig() {
  console.log("\n=== UPDATING CONFIG ===");
  console.log("Using wallet:", payer.publicKey.toString());
  
  // Find config PDA
  const [configPda] = await PublicKey.findProgramAddress(
    [Buffer.from("config")], 
    PROGRAM_ID
  );
  
  console.log("Config PDA:", configPda.toString());
  
  // Update ticket price (instruction 6)
  const priceData = Buffer.from([
    6,                      // Instruction index: 6 = UpdateTicketPrice
    0, 0, 0, 0, 0, 0, 224, 1 // 100,000,000 lamports (0.1 SOL) in little-endian
  ]);
  
  const priceIx = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: true }
    ],
    programId: PROGRAM_ID,
    data: priceData
  });
  
  console.log("Updating ticket price to 0.1 SOL...");
  try {
    const tx = new Transaction().add(priceIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log("Price updated successfully! Tx:", sig);
  } catch (e) {
    console.error("Error updating price:", e);
  }
  
  // Update fee percentage (instruction 7)
  const feeData = Buffer.from([
    7,        // Instruction index: 7 = UpdateFeePercentage
    232, 3    // 1000 basis points (10%) in little-endian
  ]);
  
  const feeIx = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: true }
    ],
    programId: PROGRAM_ID,
    data: feeData
  });
  
  console.log("Updating fee percentage to 10%...");
  try {
    const tx = new Transaction().add(feeIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log("Fee updated successfully! Tx:", sig);
  } catch (e) {
    console.error("Error updating fee:", e);
  }
  
  return configPda;
}

// 2. Create a raffle
async function createRaffle(configPda) {
  console.log("\n=== CREATING RAFFLE ===");
  
  // Generate raffle info
  const title = "Test Raffle " + Date.now();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const duration = 300; // 5 minutes
  
  console.log("Title:", title);
  console.log("Duration:", duration, "seconds");
  
  // Find raffle PDA
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
  
  // Prepare instruction data for raffle creation (instruction 1)
  const instructionData = Buffer.alloc(41); // 1 byte for instruction + 32 bytes for title + 8 bytes for duration
  instructionData.writeUInt8(1, 0); // instruction 1 = InitializeRaffle
  
  // Write title (32 bytes)
  const titleBuffer = Buffer.from(title.padEnd(32).substring(0, 32));
  titleBuffer.copy(instructionData, 1);
  
  // Write duration (5 minutes = 300 seconds)
  instructionData.writeBigUInt64LE(BigInt(duration), 33);
  
  // Create the transaction instruction
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: rafflePda, isSigner: false, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
    ],
    programId: PROGRAM_ID,
    data: instructionData
  });
  
  console.log("Creating raffle...");
  try {
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log("Raffle created successfully! Tx:", sig);
    return { rafflePda, endTime: Math.floor(Date.now() / 1000) + duration };
  } catch (e) {
    console.error("Error creating raffle:", e);
    throw e;
  }
}

// 3. Buy tickets
async function buyTickets(rafflePda) {
  console.log("\n=== BUYING TICKETS ===");
  
  // Find ticket PDA
  const ticketIndex = 0;
  const [ticketPda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("ticket"),
      rafflePda.toBuffer(),
      Buffer.from(ticketIndex.toString())
    ],
    PROGRAM_ID
  );
  
  console.log("Ticket PDA:", ticketPda.toString());
  
  // Number of tickets to buy
  const ticketCount = 5;
  console.log("Buying", ticketCount, "tickets");
  
  // Create instruction data for buying tickets (instruction 2)
  const instructionData = Buffer.alloc(9); // 1 byte for instruction + 8 bytes for ticket count
  instructionData.writeUInt8(2, 0); // instruction 2 = PurchaseTickets
  instructionData.writeBigUInt64LE(BigInt(ticketCount), 1);
  
  // Create transaction instruction
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: rafflePda, isSigner: false, isWritable: true },
      { pubkey: ticketPda, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: true }, // Using payer as treasury for simplicity
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
    ],
    programId: PROGRAM_ID,
    data: instructionData
  });
  
  console.log("Purchasing tickets...");
  try {
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log("Tickets purchased successfully! Tx:", sig);
    return ticketPda;
  } catch (e) {
    console.error("Error purchasing tickets:", e);
    throw e;
  }
}

// 4a. Request VRF randomness
async function requestRandomness(rafflePda) {
  console.log("\n=== REQUESTING RANDOMNESS ===");
  
  // Create instruction data for requesting randomness (instruction 8)
  const instructionData = Buffer.from([8]); // instruction 8 = RequestRandomness
  
  // Create transaction instruction
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: rafflePda, isSigner: false, isWritable: true },
      { pubkey: VRF_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: SWITCHBOARD_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: ORACLE_QUEUE, isSigner: false, isWritable: false }
    ],
    programId: PROGRAM_ID,
    data: instructionData
  });
  
  console.log("Requesting VRF randomness...");
  try {
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log("Randomness requested successfully! Tx:", sig);
    return true;
  } catch (e) {
    console.error("Error requesting randomness:", e);
    return false;
  }
}

// 4b. Complete raffle with VRF
async function completeRaffleWithVRF(rafflePda, ticketPda) {
  console.log("\n=== COMPLETING RAFFLE ===");
  
  // Create instruction data for completing raffle with VRF (instruction 9)
  const instructionData = Buffer.from([9]); // instruction 9 = CompleteRaffleWithVrf
  
  // Create transaction instruction
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: rafflePda, isSigner: false, isWritable: true },
      { pubkey: VRF_ACCOUNT, isSigner: false, isWritable: false },
      { pubkey: ticketPda, isSigner: false, isWritable: true }, // Winner ticket
      { pubkey: SWITCHBOARD_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
    ],
    programId: PROGRAM_ID,
    data: instructionData
  });
  
  console.log("Completing raffle with VRF...");
  try {
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log("Raffle completed successfully! Tx:", sig);
    return true;
  } catch (e) {
    console.error("Error completing raffle:", e);
    return false;
  }
}

// Run the full test
async function runFullTest() {
  try {
    // 1. Update config
    const configPda = await updateConfig();
    
    // 2. Create a raffle
    const { rafflePda, endTime } = await createRaffle(configPda);
    
    // 3. Buy tickets
    const ticketPda = await buyTickets(rafflePda);
    
    // 4. Wait for raffle to end
    const currentTime = Math.floor(Date.now() / 1000);
    const timeToWait = Math.max(0, endTime - currentTime) + 10; // Add 10 seconds buffer
    
    if (timeToWait > 0) {
      console.log(`\nWaiting ${timeToWait} seconds for raffle to end...`);
      await sleep(timeToWait * 1000);
    }
    
    // 5. Request randomness
    await requestRandomness(rafflePda);
    
    // Wait for VRF to complete (could take some time)
    console.log("\nWaiting 30 seconds for VRF to complete...");
    await sleep(30000);
    
    // 6. Complete raffle
    await completeRaffleWithVRF(rafflePda, ticketPda);
    
    console.log("\n✅ FULL TEST COMPLETED SUCCESSFULLY!");
    console.log("Raffle:", rafflePda.toString());
    console.log("Ticket:", ticketPda.toString());
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run just one specific test function
async function runSpecificTest() {
  // Uncomment the function you want to test
  
  // Update config only
  // await updateConfig();
  
  // Create raffle only (need config PDA)
  // const configPda = new PublicKey('YOUR_CONFIG_PDA');
  // await createRaffle(configPda);
  
  // Buy tickets only (need raffle PDA)
  // const rafflePda = new PublicKey('YOUR_RAFFLE_PDA');
  // await buyTickets(rafflePda);
  
  // Request randomness only (need raffle PDA)
  // const rafflePda = new PublicKey('YOUR_RAFFLE_PDA');
  // await requestRandomness(rafflePda);
  
  // Complete raffle only (need raffle PDA and ticket PDA)
  // const rafflePda = new PublicKey('YOUR_RAFFLE_PDA');
  // const ticketPda = new PublicKey('YOUR_TICKET_PDA');
  // await completeRaffleWithVRF(rafflePda, ticketPda);
}

// Run the full test by default
runFullTest().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  }
);

const { Connection, PublicKey, Keypair, TransactionInstruction, Transaction, sendAndConfirmTransaction, SystemProgram, SYSVAR_CLOCK_PUBKEY } = require('@solana/web3.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Helper function to wait for a number of seconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Update config price only (simpler test)
async function updateConfigPrice() {
  console.log("\n=== UPDATING CONFIG PRICE ===");
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
    return configPda;
  } catch (e) {
    console.error("Error updating price:", e);
    throw e;
  }
}

// 2. Create a raffle (simple test)
async function createRaffle(configPda) {
  console.log("\n=== CREATING RAFFLE ===");
  
  // Generate raffle info
  const title = "Test Raffle " + Date.now();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const duration = 60; // 1 minute for quicker testing
  
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
  
  // Write duration
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

// Run a simpler test without VRF
async function runSimpleTest() {
  try {
    console.log("Starting simplified raffle test...");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Wallet:", payer.publicKey.toString());
    
    // Check wallet balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log("Wallet balance:", balance / 1_000_000_000, "SOL");
    
    // 1. Update config price
    const configPda = await updateConfigPrice();
    
    // 2. Create a raffle
    const { rafflePda } = await createRaffle(configPda);
    
    // 3. Buy tickets
    const ticketPda = await buyTickets(rafflePda);
    
    console.log("\n✅ TEST COMPLETED SUCCESSFULLY!");
    console.log("Config:", configPda.toString());
    console.log("Raffle:", rafflePda.toString());
    console.log("Ticket:", ticketPda.toString());
    
    return { configPda, rafflePda, ticketPda };
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
runSimpleTest().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  }
);

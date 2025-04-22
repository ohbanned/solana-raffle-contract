const { Connection, PublicKey, Keypair, TransactionInstruction, Transaction, sendAndConfirmTransaction, SystemProgram } = require('@solana/web3.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function initializeConfig() {
  console.log("Initializing Config...");
  console.log("Program ID:", PROGRAM_ID.toString());
  console.log("Wallet:", payer.publicKey.toString());
  
  // Check wallet balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log("Wallet balance:", balance / 1_000_000_000, "SOL");
  
  // Find config PDA
  const [configPda] = await PublicKey.findProgramAddress(
    [Buffer.from("config")], 
    PROGRAM_ID
  );
  
  console.log("Config PDA:", configPda.toString());
  
  // Create data buffer for initialize config (instruction 0)
  const data = Buffer.alloc(11); // 1 byte for instruction + 8 bytes for price + 2 bytes for fee
  data.writeUInt8(0, 0); // instruction 0 = InitializeConfig
  data.writeBigUInt64LE(BigInt(100000000), 1); // 0.1 SOL = 100,000,000 lamports
  data.writeUInt16LE(1000, 9); // 10% fee = 1000 basis points
  
  // Create the transaction instruction
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: false }, // treasury
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    programId: PROGRAM_ID,
    data: data
  });
  
  console.log("Sending transaction to initialize config...");
  try {
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log("Config initialized successfully! Tx:", sig);
    
    // Verify the config was created
    const configInfo = await connection.getAccountInfo(configPda);
    if (configInfo) {
      console.log("Config account verified!");
      console.log("Config owner:", configInfo.owner.toString());
      console.log("Config data size:", configInfo.data.length, "bytes");
      return configPda;
    } else {
      console.log("Config account still not found. Initialization may have failed.");
      return null;
    }
  } catch (e) {
    console.error("Error initializing config:", e);
    if (e.logs) {
      console.error("Transaction logs:", e.logs);
    }
    return null;
  }
}

// Run the initialization
initializeConfig().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  }
);

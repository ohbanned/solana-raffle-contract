const { Connection, PublicKey, Keypair } = require('@solana/web3.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function checkProgramInfo() {
  try {
    console.log("Checking program info for:", PROGRAM_ID.toString());
    console.log("Wallet:", payer.publicKey.toString());
    
    // Check wallet balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log("Wallet balance:", balance / 1_000_000_000, "SOL");
    
    // Try to get program account info
    const programInfo = await connection.getAccountInfo(PROGRAM_ID);
    
    if (programInfo) {
      console.log("Program exists!");
      console.log("Program owner:", programInfo.owner.toString());
      console.log("Program data size:", programInfo.data.length, "bytes");
      console.log("Program executable:", programInfo.executable);
    } else {
      console.log("Program not found. Check your program ID.");
    }
    
    // Find config PDA
    const [configPda] = await PublicKey.findProgramAddress(
      [Buffer.from("config")], 
      PROGRAM_ID
    );
    
    console.log("Config PDA:", configPda.toString());
    
    // Check if config exists
    const configInfo = await connection.getAccountInfo(configPda);
    if (configInfo) {
      console.log("Config account exists!");
      console.log("Config owner:", configInfo.owner.toString());
      console.log("Config data size:", configInfo.data.length, "bytes");
    } else {
      console.log("Config account not found. It may need to be initialized first.");
    }
  } catch (error) {
    console.error("Error checking program:", error);
  }
}

// Run the check
checkProgramInfo().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  }
);

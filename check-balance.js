const { 
  Connection, 
  PublicKey, 
  Keypair
} = require('@solana/web3.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Config PDA (verified from previous tests)
const CONFIG_PDA = new PublicKey('B3r4z3rzEuUNGRyZEPfJBBgkyP2z3cSmFDfDR5vkQH7n');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function checkStatus() {
  try {
    console.log("=== Basic Status Check ===");
    
    // Check wallet balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log("Admin wallet:", payer.publicKey.toString());
    console.log("Balance:", balance / 1_000_000_000, "SOL");
    
    // Check if program exists
    const programInfo = await connection.getAccountInfo(PROGRAM_ID);
    console.log("\nProgram ID:", PROGRAM_ID.toString());
    
    if (programInfo) {
      console.log("✅ Program exists!");
      console.log("- Executable:", programInfo.executable);
      console.log("- Data size:", programInfo.data.length, "bytes");
    } else {
      console.log("❌ Program not found!");
    }
    
    // Check if config exists
    const configInfo = await connection.getAccountInfo(CONFIG_PDA);
    console.log("\nConfig PDA:", CONFIG_PDA.toString());
    
    if (configInfo) {
      console.log("✅ Config exists!");
      console.log("- Owner:", configInfo.owner.toString());
      console.log("- Data size:", configInfo.data.length, "bytes");
      
      // Parse some basic data
      const isInitialized = configInfo.data[0] === 1;
      console.log("- Is initialized:", isInitialized);
    } else {
      console.log("❌ Config not found!");
    }
    
    return true;
  } catch (error) {
    console.error("Error checking status:", error);
    return false;
  }
}

checkStatus()
  .then(() => {
    console.log("\nStatus check complete!");
    process.exit(0);
  })
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

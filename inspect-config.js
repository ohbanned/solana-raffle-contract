const { 
  Connection, 
  PublicKey, 
  Keypair
} = require('@solana/web3.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Config PDA (confirmed from previous test)
const CONFIG_PDA = new PublicKey('B3r4z3rzEuUNGRyZEPfJBBgkyP2z3cSmFDfDR5vkQH7n');

// Your wallet keypair
const payerSecret = [5,170,238,30,161,126,58,162,237,214,194,184,134,29,124,61,154,138,146,9,54,184,194,82,211,41,23,197,231,14,8,78,138,182,136,21,23,151,163,26,122,255,174,159,169,142,30,115,28,171,155,60,15,195,103,130,203,87,100,253,237,131,212,42];
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret));

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Function to fetch and inspect the config account
async function fetchConfig() {
  try {
    console.log("=== Fetching Config Account Data ===");
    console.log("Config PDA:", CONFIG_PDA.toString());
    
    // Fetch the account info
    const configAccount = await connection.getAccountInfo(CONFIG_PDA);
    
    if (!configAccount) {
      console.log("❌ Config account not found");
      return null;
    }
    
    console.log("✅ Config account exists");
    console.log("- Owner:", configAccount.owner.toString());
    console.log("- Data size:", configAccount.data.length, "bytes");
    
    // Attempt to parse the data (basic structure based on Rust)
    // Config struct in Rust likely has:
    // - is_initialized: bool (1 byte)
    // - ticket_price: u64 (8 bytes)
    // - fee_basis_points: u16 (2 bytes)
    // - treasury: Pubkey (32 bytes)
    
    const data = configAccount.data;
    
    if (data.length >= 43) { // Minimum expected size
      const isInitialized = data[0] === 1; // 1 = true
      
      // Read ticket price (u64 - 8 bytes)
      const ticketPrice = data.readBigUInt64LE(1);
      
      // Read fee basis points (u16 - 2 bytes)
      const feeBasisPoints = data.readUInt16LE(9);
      
      // Read treasury pubkey (32 bytes)
      const treasuryBytes = data.slice(11, 43);
      const treasury = new PublicKey(treasuryBytes);
      
      console.log("\nConfig Data:");
      console.log("- Initialized:", isInitialized);
      console.log("- Ticket Price:", ticketPrice.toString(), "lamports", "(" + (Number(ticketPrice) / 1_000_000_000) + " SOL)");
      console.log("- Fee Basis Points:", feeBasisPoints, "(" + (feeBasisPoints / 100) + "%)");
      console.log("- Treasury:", treasury.toString());
      
      return {
        isInitialized,
        ticketPrice,
        feeBasisPoints,
        treasury: treasury.toString()
      };
    } else {
      console.log("❌ Data too short to parse:", data.length, "bytes");
      console.log("Raw data:", data.toString('hex'));
      return null;
    }
    
  } catch (error) {
    console.error("Error fetching config:", error);
    return null;
  }
}

// Just fetch the config info
fetchConfig()
  .then(result => {
    if (result) {
      console.log("\n✅ Config info retrieved successfully!");
      
      // Save the result for future reference
      require('fs').writeFileSync('config-info.json', JSON.stringify(result, null, 2));
      console.log("Results saved to config-info.json");
    } else {
      console.log("\n❌ Failed to retrieve config info");
    }
    process.exit(0);
  })
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

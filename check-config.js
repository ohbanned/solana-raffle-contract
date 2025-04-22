const { 
  Connection, 
  PublicKey
} = require('@solana/web3.js');

// Program ID
const PROGRAM_ID = new PublicKey('JD5au1ex5WLUhoURTwwrrsdKJin7W7yUvcpmJpSkzuv6');

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function checkConfig() {
  try {
    console.log("=== Checking Config Account ===");
    
    // Derive the config PDA
    const [configPDA, bump] = await PublicKey.findProgramAddress(
      [Buffer.from("config")],
      PROGRAM_ID
    );
    console.log("Config PDA:", configPDA.toString(), "with bump:", bump);
    
    // Check if config account exists
    const configAccount = await connection.getAccountInfo(configPDA);
    
    if (configAccount) {
      console.log("✅ Config account exists!");
      console.log("- Owner:", configAccount.owner.toString());
      console.log("- Data size:", configAccount.data.length, "bytes");
      
      // Try to parse the data
      if (configAccount.data.length > 0) {
        const isInitialized = configAccount.data[0] === 1;
        console.log("- Is initialized:", isInitialized);
        
        // Attempt to parse other values
        if (configAccount.data.length >= 73) {
          try {
            // Display in hex format to inspect
            console.log("- Raw data (hex):", configAccount.data.toString('hex').substring(0, 100) + "...");
            
            // First byte is initialized flag
            // Next 32 bytes should be admin pubkey
            const adminPubkeyBytes = configAccount.data.slice(1, 33);
            const adminPubkey = new PublicKey(adminPubkeyBytes);
            console.log("- Admin:", adminPubkey.toString());
            
            // Next 32 bytes should be treasury pubkey
            const treasuryPubkeyBytes = configAccount.data.slice(33, 65);
            const treasuryPubkey = new PublicKey(treasuryPubkeyBytes);
            console.log("- Treasury:", treasuryPubkey.toString());
            
            // Next 8 bytes should be ticket price (u64)
            const price = configAccount.data.slice(65, 73).readBigUInt64LE();
            console.log("- Ticket price:", price.toString(), "lamports", "(" + (Number(price) / 1_000_000_000) + " SOL)");
            
            // Next 2 bytes should be fee basis points (u16)
            if (configAccount.data.length >= 75) {
              const feeBasisPoints = configAccount.data.slice(73, 75).readUInt16LE();
              console.log("- Fee basis points:", feeBasisPoints, "(" + (feeBasisPoints / 100) + "%)");
            }
          } catch (e) {
            console.log("- Error parsing config data:", e.message);
          }
        } else {
          console.log("- Data too short to parse structure");
        }
      }
    } else {
      console.log("❌ Config account does not exist");
    }
    
  } catch (error) {
    console.error("Error checking config:", error);
  }
}

// Run the check
checkConfig()
  .then(() => {
    console.log("\nConfig check complete");
    process.exit(0);
  })
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

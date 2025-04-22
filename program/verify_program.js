const { Connection, PublicKey } = require('@solana/web3.js');

// Program ID to verify
const programId = new PublicKey('9BLyPzJR2r8sYbRaaKi8tCKMvFfLxTsnfs9P5JJxaXds');

// Connect to Solana (try both mainnet and devnet)
async function checkProgram() {
  console.log(`Checking program: ${programId.toString()}`);
  
  // Try devnet first
  console.log('\nChecking on devnet...');
  const devnetConnection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  try {
    const devnetAccountInfo = await devnetConnection.getAccountInfo(programId);
    if (devnetAccountInfo) {
      console.log('✅ Program found on devnet!');
      console.log(`Program size: ${devnetAccountInfo.data.length} bytes`);
      console.log(`Owner: ${devnetAccountInfo.owner.toString()}`);
      console.log(`Executable: ${devnetAccountInfo.executable}`);
    } else {
      console.log('❌ Program not found on devnet');
    }
  } catch (error) {
    console.error('Error checking devnet:', error);
  }
  
  // Then try mainnet
  console.log('\nChecking on mainnet...');
  const mainnetConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  
  try {
    const mainnetAccountInfo = await mainnetConnection.getAccountInfo(programId);
    if (mainnetAccountInfo) {
      console.log('✅ Program found on mainnet!');
      console.log(`Program size: ${mainnetAccountInfo.data.length} bytes`);
      console.log(`Owner: ${mainnetAccountInfo.owner.toString()}`);
      console.log(`Executable: ${mainnetAccountInfo.executable}`);
    } else {
      console.log('❌ Program not found on mainnet');
    }
  } catch (error) {
    console.error('Error checking mainnet:', error);
  }
}

// Run the verification
checkProgram().then(() => {
  console.log('\nVerification complete');
}).catch(err => {
  console.error('Fatal error:', err);
});

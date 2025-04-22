const { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');
const BN = require('bn.js');

// Program ID from the deployed contract
const PROGRAM_ID = new PublicKey('9BLyPzJR2r8sYbRaaKi8tCKMvFfLxTsnfs9P5JJxaXds');

// Connect to Solana network (change to 'mainnet-beta' for production or 'devnet' for testing)
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Set up test wallet - in real usage, you'd load your own keypair
// This is just for testing - NEVER use this in production!
let payer;
try {
    // Try to load from a local file if it exists
    const payerSecretKey = new Uint8Array(JSON.parse(fs.readFileSync('./test-payer.json')));
    payer = Keypair.fromSecretKey(payerSecretKey);
    console.log('Loaded existing test wallet');
} catch (e) {
    // Generate a new keypair if no file exists
    payer = Keypair.generate();
    fs.writeFileSync('./test-payer.json', JSON.stringify(Array.from(payer.secretKey)));
    console.log('Generated new test wallet');
}

console.log(`Test Wallet Public Key: ${payer.publicKey.toString()}`);

// Function to request airdrop (only works on devnet)
async function requestAirdrop() {
    console.log('Requesting airdrop of 2 SOL...');
    const signature = await connection.requestAirdrop(payer.publicKey, 2 * 10**9);
    await connection.confirmTransaction(signature);
    console.log('Airdrop received!');
}

// Test creating a new raffle
async function testCreateRaffle() {
    console.log('\n----- Testing Create Raffle -----');
    
    // Generate a new keypair for the raffle
    const raffleKeypair = Keypair.generate();
    console.log(`New Raffle ID: ${raffleKeypair.publicKey.toString()}`);
    
    // Define raffle parameters
    const titleStr = 'Test Raffle'.padEnd(32, '\0');
    const title = Buffer.from(titleStr, 'utf8');
    const duration = new BN(86400); // 24 hours in seconds
    
    // Construct the instruction data
    // This would ideally use the exact same instruction format as your Rust program
    const instructionData = Buffer.from([
        1, // Instruction ID for InitializeRaffle
        ...title,
        ...duration.toArray('le', 8)
    ]);
    
    // Create a transaction
    const transaction = new Transaction().add({
        keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority
            { pubkey: raffleKeypair.publicKey, isSigner: true, isWritable: true }, // raffle account
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });
    
    try {
        const txSignature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [payer, raffleKeypair]
        );
        console.log(`Raffle creation successful! TX: ${txSignature}`);
        return raffleKeypair.publicKey;
    } catch (error) {
        console.error('Error creating raffle:', error);
        throw error;
    }
}

// Main test function
async function runTests() {
    console.log('=== SolCino Raffle Contract Live Tests ===');
    console.log(`Program ID: ${PROGRAM_ID.toString()}`);
    console.log(`Network: ${connection.rpcEndpoint}`);
    
    try {
        // Get SOL for testing on devnet
        await requestAirdrop();
        
        // Test raffle creation
        const raffleId = await testCreateRaffle();
        
        // More tests can be added here to test ticket purchases, etc.
        
        console.log('\n✅ All tests completed successfully!');
    } catch (error) {
        console.error('\n❌ Tests failed:', error);
    }
}

// Add more debug logging
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Starting tests...');

// Run the tests
runTests().catch(err => {
  console.error('Fatal error running tests:', err);
});

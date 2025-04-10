const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');
const BufferLayout = require('buffer-layout');
const BN = require('bn.js');

// Constants
const PROGRAM_ID = new PublicKey('CjwMMR1eXFqjxzEtcixX6GJ4q7yvpUWpCFaLefg2GBGw');
const CONFIG_SEED = Buffer.from('config');
const TICKET_PRICE = 100000000; // 0.1 SOL in lamports
const FEE_BASIS_POINTS = 500; // 5%

// Helper function to load wallet from file
function loadWalletKey(keypairFile) {
  if (!fs.existsSync(keypairFile)) {
    throw new Error(`Keypair file not found: ${keypairFile}`);
  }
  const keypairData = JSON.parse(fs.readFileSync(keypairFile, 'utf8'));
  return Keypair.fromSecretKey(Buffer.from(keypairData));
}

// Determine the config PDA address
async function findConfigAddress() {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    PROGRAM_ID
  );
}

// Create buffer layout for serializing instruction data
const initializeConfigLayout = BufferLayout.struct([
  BufferLayout.u8('instruction'),
  BufferLayout.blob(8, 'ticketPrice'),
  BufferLayout.u16('feeBasisPoints'),
]);

// Function to serialize instruction data
function serializeInitializeConfigInstruction(ticketPrice, feeBasisPoints) {
  const data = Buffer.alloc(11); // 1 byte for instruction, 8 bytes for ticket price, 2 bytes for fee basis points
  const layoutData = {
    instruction: 0, // InitializeConfig instruction index
    ticketPrice: new BN(ticketPrice).toArrayLike(Buffer, 'le', 8),
    feeBasisPoints: feeBasisPoints,
  };
  initializeConfigLayout.encode(layoutData, data);
  return data;
}

async function main() {
  try {
    // Load keypair
    const walletKeyPath = require('os').homedir() + '/.config/solana/id.json';
    const wallet = loadWalletKey(walletKeyPath);
    console.log(`Loaded wallet: ${wallet.publicKey.toString()}`);

    // Connect to devnet
    console.log('Connecting to Solana devnet...');
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // Find the config address
    const [configPubkey, configBump] = await findConfigAddress();
    console.log(`Config PDA: ${configPubkey.toString()}`);
    
    // Try to get config account info to see if it already exists
    const configAccount = await connection.getAccountInfo(configPubkey);
    
    if (configAccount) {
      console.log('Config account already exists. Reading data...');
      // Read and display config data
      if (configAccount.data.length >= 97) { // Make sure there's enough data
        const isInitialized = configAccount.data[0] !== 0;
        const admin = new PublicKey(configAccount.data.slice(1, 33));
        const treasury = new PublicKey(configAccount.data.slice(33, 65));
        const ticketPrice = new BN(configAccount.data.slice(65, 73), 'le').toNumber();
        const feeBasisPoints = configAccount.data.readUInt16LE(73);
        
        console.log('Config Data:');
        console.log(`  Initialized: ${isInitialized}`);
        console.log(`  Admin: ${admin.toString()}`);
        console.log(`  Treasury: ${treasury.toString()}`);
        console.log(`  Ticket Price: ${ticketPrice / 1_000_000_000} SOL`);
        console.log(`  Fee: ${feeBasisPoints / 100}%`);
      } else {
        console.log('Config account exists but data is invalid');
      }
    } else {
      console.log('Config account does not exist yet. Creating...');
    }
    
    // Instruction data - Initialize config with treasury = admin, ticket price = 0.1 SOL, fee = 5%
    const instructionData = serializeInitializeConfigInstruction(TICKET_PRICE, FEE_BASIS_POINTS);
    
    // Create transaction
    const transaction = new Transaction().add({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // Admin
        { pubkey: configPubkey, isSigner: false, isWritable: true }, // Config account
        { pubkey: wallet.publicKey, isSigner: false, isWritable: false }, // Treasury (same as admin for simplicity)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System program
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });
    
    // Send transaction
    console.log('Sending transaction to initialize config...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      }
    );
    
    console.log(`Transaction successful! Signature: ${signature}`);
    console.log(`Config initialized with admin and treasury set to: ${wallet.publicKey.toString()}`);
    console.log(`Ticket price set to: ${TICKET_PRICE / 1_000_000_000} SOL`);
    console.log(`Fee set to: ${FEE_BASIS_POINTS / 100}%`);
    
    // Verify the config was initialized
    const updatedConfigAccount = await connection.getAccountInfo(configPubkey);
    if (updatedConfigAccount) {
      console.log('Config account created successfully!');
    } else {
      console.log('Failed to create config account');
    }
    
  } catch (error) {
    console.error('Error initializing config:', error);
  }
}

main();

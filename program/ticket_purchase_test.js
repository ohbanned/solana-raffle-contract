const { 
  Connection, 
  PublicKey, 
  Keypair, 
  SystemProgram, 
  Transaction, 
  sendAndConfirmTransaction,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
} = require('@solana/web3.js');
const fs = require('fs');
const BN = require('bn.js');

// Program ID of the deployed raffle contract
const PROGRAM_ID = new PublicKey('7AcL747zBfKrgPzvNmkNuSDPfUb4mEa6oznemWAt3RRW');

// Connect to Solana devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Load test wallet
let payer;
try {
  const payerSecretKey = new Uint8Array(JSON.parse(fs.readFileSync('./test-payer.json')));
  payer = Keypair.fromSecretKey(payerSecretKey);
  console.log('Loaded test wallet:', payer.publicKey.toString());
} catch (e) {
  console.error('Error loading test wallet:', e);
  process.exit(1);
}

// Load raffle account
let raffleKeypair;
try {
  const raffleSecretKey = new Uint8Array(JSON.parse(fs.readFileSync('./test-raffle.json')));
  raffleKeypair = Keypair.fromSecretKey(raffleSecretKey);
  console.log('Loaded raffle account:', raffleKeypair.publicKey.toString());
} catch (e) {
  console.error('Error loading raffle account:', e);
  process.exit(1);
}

// Find config PDA
const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('config')],
  PROGRAM_ID
);
console.log('Config PDA:', configPda.toString());

async function purchaseTicketsSimplified() {
  try {
    console.log('\n***** TICKET PURCHASE TEST *****');
    
    // Get current account balances
    const payerBalance = await connection.getBalance(payer.publicKey);
    const raffleBalance = await connection.getBalance(raffleKeypair.publicKey);
    console.log(`Buyer balance: ${payerBalance / 1e9} SOL`);
    console.log(`Raffle balance: ${raffleBalance / 1e9} SOL`);
    
    // Fetch config data to get treasury
    const configAccountInfo = await connection.getAccountInfo(configPda);
    // Read treasury from config account data (at offset 11, length 32)
    const treasuryPubkey = new PublicKey(configAccountInfo.data.slice(11, 43));
    console.log('Treasury:', treasuryPubkey.toString());
    
    const treasuryBalance = await connection.getBalance(treasuryPubkey);
    console.log(`Treasury balance: ${treasuryBalance / 1e9} SOL`);
    
    // Number of tickets to purchase
    const ticketCount = 1;
    
    // Create ticket purchase data (instruction 2 = purchase tickets)
    const instructionData = Buffer.from(
      Uint8Array.of(
        2, // Purchase Tickets instruction index
        ...new BN(ticketCount).toArray('le', 8) // u64 ticket count
      )
    );
    
    // Create a ticket purchase account
    const ticketPurchaseKeypair = Keypair.generate();
    console.log('Ticket purchase account:', ticketPurchaseKeypair.publicKey.toString());
    
    // Calculate the size needed for the ticket purchase account
    const TICKET_PURCHASE_SIZE = 1 + // is_initialized
                                32 + // raffle pubkey
                                32 + // purchaser pubkey
                                8 + // ticket_count
                                8; // purchase_time
    
    // Create account instruction
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: ticketPurchaseKeypair.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(TICKET_PURCHASE_SIZE),
      space: TICKET_PURCHASE_SIZE,
      programId: PROGRAM_ID,
    });
    
    // Create the purchase instruction
    const purchaseIx = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // purchaser
        { pubkey: raffleKeypair.publicKey, isSigner: false, isWritable: true }, // raffle account
        { pubkey: ticketPurchaseKeypair.publicKey, isSigner: false, isWritable: true }, // ticket purchase account
        { pubkey: treasuryPubkey, isSigner: false, isWritable: true }, // treasury
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock sysvar
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    });
    
    // Create transaction with both instructions
    const transaction = new Transaction()
      .add(createAccountIx)
      .add(purchaseIx);
    
    // Send transaction with both signers
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, ticketPurchaseKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`Transaction successful!`);
    console.log(`Signature: ${signature}`);
    
    // Check updated balances
    const newPayerBalance = await connection.getBalance(payer.publicKey);
    const newRaffleBalance = await connection.getBalance(raffleKeypair.publicKey);
    const newTreasuryBalance = await connection.getBalance(treasuryPubkey);
    
    console.log(`\nBuyer balance after: ${newPayerBalance / 1e9} SOL (spent ${(payerBalance - newPayerBalance) / 1e9} SOL)`);
    console.log(`Raffle balance after: ${newRaffleBalance / 1e9} SOL (received ${(newRaffleBalance - raffleBalance) / 1e9} SOL)`);
    console.log(`Treasury balance after: ${newTreasuryBalance / 1e9} SOL (received ${(newTreasuryBalance - treasuryBalance) / 1e9} SOL)`);
    
    return signature;
  } catch (error) {
    console.error('Error purchasing tickets:', error);
    
    // If we have transaction logs, print them for debugging
    if (error.transactionLogs) {
      console.log('\nTransaction logs:');
      error.transactionLogs.forEach(log => console.log(log));
    }
    
    throw error;
  }
}

// Run the test
purchaseTicketsSimplified()
  .then(() => console.log('\nTest completed successfully!'))
  .catch(err => console.error('\nTest failed:', err.message));

import * as bcrypt from 'bcrypt';

async function generateHash() {
  const password = 'password';
  const hash = await bcrypt.hash(password, 10);
  
  console.log('='.repeat(60));
  console.log('CORRECT BCRYPT HASH FOR PASSWORD: "password"');
  console.log('='.repeat(60));
  console.log(hash);
  console.log('='.repeat(60));
  
  // Verify it works
  const isValid = await bcrypt.compare(password, hash);
  console.log('Verification:', isValid ? '✓ VALID' : '✗ INVALID');
}

generateHash();

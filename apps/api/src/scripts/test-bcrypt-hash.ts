import * as bcrypt from 'bcrypt';

async function testHash() {
  const password = 'password';
  const storedHash =
    '$2b$10$UVlW1ue3xj.v9BzBnLHfOuKG/LOjqm0DxQfR7yqC6hQJ/2qfh3D5i';

  console.log('Testing bcrypt hash...');
  console.log('Password:', password);
  console.log('Stored hash:', storedHash);

  const isValid = await bcrypt.compare(password, storedHash);
  console.log('Is valid?', isValid);

  // Generate a fresh hash to compare
  const freshHash = await bcrypt.hash(password, 10);
  console.log('\nFresh hash for comparison:', freshHash);

  const freshIsValid = await bcrypt.compare(password, freshHash);
  console.log('Fresh hash valid?', freshIsValid);
}

testHash();

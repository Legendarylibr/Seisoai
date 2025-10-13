// Debug Solana Wallet Connection
// Run this in the browser console to debug Phantom connection issues

console.log('🔍 Starting Solana wallet debug...');

// Check if Phantom exists
console.log('1. Checking Phantom availability:');
console.log('   window.solana:', window.solana);
console.log('   window.solana?.isPhantom:', window.solana?.isPhantom);
console.log('   window.solana?.connect:', typeof window.solana?.connect);

if (!window.solana) {
  console.log('❌ Phantom not found - please install Phantom extension');
} else if (!window.solana.isPhantom) {
  console.log('❌ Phantom not detected - please make sure Phantom extension is enabled');
} else {
  console.log('✅ Phantom detected, testing connection...');
  
  // Test connection
  window.solana.connect()
    .then(result => {
      console.log('✅ Connection successful:', result);
      console.log('   Public Key:', result.publicKey.toString());
      console.log('   Connected:', window.solana.isConnected);
    })
    .catch(error => {
      console.log('❌ Connection failed:', error);
      console.log('   Error message:', error.message);
      console.log('   Error code:', error.code);
      console.log('   Error name:', error.name);
      
      // Check if it's a user rejection
      if (error.code === 4001) {
        console.log('   → This is a user rejection (user cancelled)');
      } else if (error.message?.includes('User rejected')) {
        console.log('   → User rejected the connection');
      } else {
        console.log('   → This is a different error');
      }
    });
}

// Check Phantom state
console.log('2. Phantom state:');
console.log('   isConnected:', window.solana?.isConnected);
console.log('   publicKey:', window.solana?.publicKey?.toString());

// Check for common issues
console.log('3. Common issues check:');
console.log('   Phantom unlocked:', window.solana?.isConnected !== false);
console.log('   Network available:', navigator.onLine);
console.log('   Popup blocked:', 'Check if browser blocked popup');

console.log('🔍 Debug complete - check results above');

// Test script for STT endpoint
const fs = require('fs');

// Create a minimal test audio in WebM format (base64 encoded)
// This is a very short silence audio file for testing the API structure
const testAudioBase64 = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////FUmpZpkq17GDD0JATYCGQ2hyb21lV0GGQ2hyb21lFlSua7+uvdeBAXPFh1VExuZ7kRN0ZXJuYWxseSBzaWxlbnQ=';

async function testSTT() {
  console.log('Testing STT endpoint...\n');

  try {
    const response = await fetch('http://localhost:3000/api/speech-to-text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audio: testAudioBase64
      })
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('\nResponse body:', responseText);

    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('\n✅ STT Success!');
      console.log('Transcribed text:', data.text || data);
    } else {
      console.log('\n❌ STT Failed');
      console.log('Error details:', responseText);
    }
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

// Run the test
testSTT();

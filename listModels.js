// Node 18+ és CommonJS
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const apiKey = process.env.GEMINI_API_KEY;
const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';

async function listModels() {
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP hiba: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Elérhető modellek:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Hiba a modellek lekérésekor:', error);
  }
}

listModels();

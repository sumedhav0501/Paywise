require('dotenv').config();
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const qs = require('querystring');
const jwt = require('jsonwebtoken');
const forge = require('node-forge');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { handleSearch } = require('./controllers/searchController');

const app = express();
app.use(express.json());
const corsOptions = {
  origin: '*',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Load environment variables
const {
  PFX_CERT_PATH,
  PFX_CERT_PASSWORD,
  API_ENDPOINT,
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  API_SCOPE
} = process.env;

if (!PFX_CERT_PATH || !PFX_CERT_PASSWORD || !API_ENDPOINT || !AZURE_TENANT_ID || !AZURE_CLIENT_ID || !API_SCOPE) {
  console.error('❌ Missing one or more required environment variables.');
  process.exit(1);
}

let pfxBuffer;
let certBuffer; // For forge
// Pre-parsed certificate, key, and thumbprint
let privateKeyPem = '';
let certPem = '';
let x5tBase64 = '';

// Function to download the certificate from Google Drive
async function downloadCertificate() {
  try {
    const response = await axios.get(PFX_CERT_PATH, { responseType: 'arraybuffer' });
    const isVercel = !!process.env.VERCEL;

    if (isVercel) {
      console.log('✅ Certificate downloaded in-memory for Vercel');
      return Buffer.from(response.data); // In-memory only
    } else {
      const certPath = path.join(__dirname, 'Aurelza Web Calculator.pfx');
      fs.writeFileSync(certPath, response.data);
      console.log('✅ Certificate downloaded and saved locally');
      return certPath;
    }
  } catch (err) {
    console.error('❌ Failed to download certificate:', err);
    process.exit(1);
  }
}

downloadCertificate().then((certPathOrBuffer) => {
  const isVercel = !!process.env.VERCEL;

  if (isVercel) {
    pfxBuffer = certPathOrBuffer;
    certBuffer = certPathOrBuffer;
  } else {
    pfxBuffer = fs.readFileSync(certPathOrBuffer);
    certBuffer = pfxBuffer;
  }

  // Parse certificate, key, and thumbprint once at startup
  function parseCertificateOnce() {
    const p12Asn1 = forge.asn1.fromDer(certBuffer.toString('binary'), false);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, PFX_CERT_PASSWORD);

    for (const safeContent of p12.safeContents) {
      for (const safeBag of safeContent.safeBags) {
        if (safeBag.cert) certPem = forge.pki.certificateToPem(safeBag.cert);
        if (safeBag.key) privateKeyPem = forge.pki.privateKeyToPem(safeBag.key);
      }
    }

    const cert = forge.pki.certificateFromPem(certPem);
    const thumbprint = forge.md.sha1.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex().toUpperCase();
    x5tBase64 = Buffer.from(thumbprint, 'hex').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  parseCertificateOnce();

  //comment to have it deployed

  const httpsAgent = new https.Agent({
    pfx: pfxBuffer,
    passphrase: PFX_CERT_PASSWORD,
    rejectUnauthorized: true,
    keepAlive: true, // Enable keep-alive for better performance
  });

  // Preconfigured Axios instance for API calls
  const apiClient = axios.create({
    baseURL: API_ENDPOINT,
    httpsAgent,
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 5000 // Optional: prevent long stalls
  });

  const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;

  // Token cache variables
  let cachedToken = null;
  let tokenExpiry = 0; // Unix timestamp in seconds

  function createClientAssertion() {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
      iss: AZURE_CLIENT_ID,
      sub: AZURE_CLIENT_ID,
      jti: uuidv4(),
      exp: now + 300,
      nbf: now,
    };

    const jwtToken = jwt.sign(payload, privateKeyPem, {
      algorithm: 'RS256',
      header: {
        alg: 'RS256',
        x5t: x5tBase64,
      },
    });

    // console.log("The token, here: ", jwtToken);
    return jwtToken;
  }

  // Get access token using client credentials with cert, with caching
  async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    // If token exists and is not expired (with a 60s buffer), return it
    if (cachedToken && now < tokenExpiry - 60) {
      return cachedToken;
    }
    try {
      const clientAssertion = createClientAssertion();

      const data = qs.stringify({
        client_id: AZURE_CLIENT_ID,
        scope: API_SCOPE,
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: clientAssertion,
      });

      const response = await axios.post(tokenUrl, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      // Cache the token and its expiry
      cachedToken = response.data.access_token;
      tokenExpiry = now + response.data.expires_in; // expires_in is in seconds
      console.log('🔑 Access Token (new):', cachedToken);
      return cachedToken;
    } catch (error) {
      console.error('❌ Error retrieving token:', error.response?.data || error.message);
      throw new Error('Unable to fetch access token');
    }
  }

  // Endpoint: Lease data
  app.post('/api/get-lease-data', async (req, res) => {
    console.log('📥 Request for lease data received:', req.body);

    const start = Date.now();
    try {
      const tokenStart = Date.now();
      const token = await getAccessToken();
      const tokenTime = Date.now() - tokenStart;

      const apiStart = Date.now();
      const response = await apiClient.post('/quote', req.body, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const apiTime = Date.now() - apiStart;

      console.log(`⏱️ Token time: ${tokenTime}ms, API time: ${apiTime}ms, Total: ${Date.now() - start}ms`);
      console.log('✅ Lease data retrieved');
      res.json(response.data);
    } catch (error) {
      console.error('❌ Lease API error:', error.response?.status, error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        message: 'Failed to fetch lease data',
        error: error.response?.data || error.message,
      });
    }
  });

  app.get('/', (req, res) => {
    res.send('✅ Backend is running.');
  });

  // Endpoint: Vehicle data
  app.post('/api/get-vehicle-data', async (req, res) => {
    const { brand, model, yearGroup } = req.body;

    if (!brand || !model || !yearGroup) {
      return res.status(400).json({ message: 'Missing required parameters: brand, model, or yearGroup' });
    }

    const start = Date.now();
    try {
      const tokenStart = Date.now();
      const token = await getAccessToken();
      const tokenTime = Date.now() - tokenStart;

      const vehiclePath = `/Vehicle/${encodeURIComponent(brand)}/${encodeURIComponent(model)}/${encodeURIComponent(yearGroup)}`;
      console.log('🔍 Fetching vehicle data from:', vehiclePath);

      const apiStart = Date.now();
      const response = await apiClient.get(vehiclePath, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const apiTime = Date.now() - apiStart;

      console.log(`⏱️ Token time: ${tokenTime}ms, API time: ${apiTime}ms, Total: ${Date.now() - start}ms`);
      res.json(response.data);
    } catch (error) {
      console.error('❌ Vehicle API error:', error.response?.status, error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        message: 'Failed to fetch vehicle data',
        error: error.response?.data || error.message,
      });
    }
  });

  app.get('/api/makes', async(req,res) => {
    try{
      const token = await getAccessToken();
      const response = await apiClient.get('/Vehicle/Makes',{
        headers: {Authorization: `Bearer ${token}`}
      })

      res.json(response.data);
    }catch(error){
      console.error('❌ Makes API error:', error.response?.status, error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        message: 'Failed to fetch Makes data',
        error: error.response?.data || error.message,
      });
    }
  })

  app.post('/api/models', async(req,res) => {
    try{
      const {make} = req.body
      const token = await getAccessToken();
      const response = await apiClient.get(`/Vehicle/${make}/models`,{
        headers: {Authorization: `Bearer ${token}`}
      })

      res.json(response.data);
    }catch(error){
      console.error('❌ Model API error:', error.response?.status, error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        message: 'Failed to fetch Models data',
        error: error.response?.data || error.message,
      });
    }
  })

  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`🚀 Backend server running at ${process.env.BACKEND_HOST}`);
  });

  app.get('/api/search', handleSearch);
});

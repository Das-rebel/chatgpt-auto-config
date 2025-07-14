const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');
const fetch = require('node-fetch');

// Configuration
const CONFIG = {
  REPO_OWNER: 'SubhoBasak-2003',
  REPO_NAME: 'chatgpt-auto-config',
  CONFIG_FILENAME: 'chatgpt-agent-openapi.json',
  LOCAL_CONFIG_PATH: path.join(process.env.HOME, 'Desktop/chatgpt-agent-openapi.json'),
  NGROK_API: 'http://127.0.0.1:4040/api/tunnels',
  CHECK_INTERVAL: 30000 // 30 seconds
};

const octokit = new Octokit({ 
  auth: process.env.GITHUB_TOKEN 
});

async function updateGitHubConfig(content) {
  try {
    // Get the current SHA of the file if it exists
    let sha;
    try {
      const { data } = await octokit.repos.getContent({
        owner: CONFIG.REPO_OWNER,
        repo: CONFIG.REPO_NAME,
        path: CONFIG.CONFIG_FILENAME,
      });
      sha = data.sha;
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    // Create or update the file
    await octokit.repos.createOrUpdateFileContents({
      owner: CONFIG.REPO_OWNER,
      repo: CONFIG.REPO_NAME,
      path: CONFIG.CONFIG_FILENAME,
      message: `Auto-update config at ${new Date().toISOString()}`,
      content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
      sha: sha,
    });

    const rawUrl = `https://raw.githubusercontent.com/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/main/${CONFIG.CONFIG_FILENAME}`;
    console.log(`✅ Updated GitHub config: ${rawUrl}`);
    return rawUrl;
  } catch (error) {
    console.error('❌ Error updating GitHub config:', error.message);
    throw error;
  }
}

async function getNgrokUrl() {
  try {
    const response = await fetch(CONFIG.NGROK_API);
    const data = await response.json();
    const tunnel = data.tunnels.find(t => t.proto === 'https');
    return tunnel?.public_url;
  } catch (error) {
    console.error('❌ Could not fetch ngrok URL:', error.message);
    return null;
  }
}

async function monitorAndUpdate() {
  console.log('🚀 Starting configuration monitor...');
  console.log('Press Ctrl+C to stop the monitor');
  
  let lastUrl = null;
  let lastConfig = null;

  // Initial config load
  try {
    lastConfig = JSON.parse(fs.readFileSync(CONFIG.LOCAL_CONFIG_PATH, 'utf8'));
    console.log('📋 Loaded local configuration');
  } catch (error) {
    console.error('❌ Error loading local config:', error.message);
    process.exit(1);
  }

  const checkAndUpdate = async () => {
    try {
      const currentUrl = await getNgrokUrl();
      if (!currentUrl) {
        console.log('⏳ Waiting for ngrok tunnel...');
        return;
      }

      if (currentUrl === lastUrl) return;

      console.log(`🔄 Detected new ngrok URL: ${currentUrl}`);
      
      // Update the URL in the config
      if (lastConfig.schema?.servers) {
        lastConfig.schema.servers.forEach(server => {
          if (server['x-ngrok-tunnel']) {
            server.url = currentUrl;
            server.description = `AI Agent Server (auto-updated at ${new Date().toISOString()})`;
          }
        });
      }

      // Update GitHub
      const configUrl = await updateGitHubConfig(lastConfig);
      console.log(`🌐 Configuration updated: ${configUrl}`);
      lastUrl = currentUrl;

    } catch (error) {
      console.error('❌ Error in monitoring loop:', error.message);
    }
  };

  // Initial check
  await checkAndUpdate();
  
  // Set up periodic checking
  const intervalId = setInterval(checkAndUpdate, CONFIG.CHECK_INTERVAL);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log('\n👋 Stopping configuration monitor...');
    process.exit(0);
  });
}

// Start monitoring
monitorAndUpdate().catch(console.error);

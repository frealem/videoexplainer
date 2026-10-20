// Default Server URL
const DEFAULT_SERVER_URL = "https://ais-dev-crbyjghx4apbd34lq5yqfg-91879478462.europe-west1.run.app";

let currentServerUrl = DEFAULT_SERVER_URL;
let activeTabUrl = "";
let activeTabTitle = "";
let activePlatform = "Web Resource";
let fetchedContainers = [];
let extractedTranscript = ""; // Cached for current session Q&A

document.addEventListener("DOMContentLoaded", () => {
  // Initialize Server Settings
  chrome.storage.local.get(["serverUrl"], (result) => {
    if (result.serverUrl) {
      currentServerUrl = result.serverUrl.trim().replace(/\/$/, "");
    }
    document.getElementById("serverUrlInput").value = currentServerUrl;
    testConnection();
    initActiveTab();
  });

  // Attach button click events
  document.getElementById("btnSaveServer").addEventListener("click", saveServerSettings);
  document.getElementById("btnSaveClip").addEventListener("click", extractAndSaveClip);
  document.getElementById("chatSendButton").addEventListener("click", askVideoQuestion);
  document.getElementById("chatInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      askVideoQuestion();
    }
  });
});

// Switch active tabs (Save Clip vs Ask AI)
window.switchTab = function(tabName) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

  if (tabName === "save") {
    document.getElementById("tabSaveBtn").classList.add("active");
    document.getElementById("tabSave").classList.add("active");
  } else {
    document.getElementById("tabChatBtn").classList.add("active");
    document.getElementById("tabChat").classList.add("active");
    // Auto-focus chat input
    setTimeout(() => {
      document.getElementById("chatInput").focus();
    }, 100);
  }
};

// Expandable configurations
window.toggleSettings = function() {
  const toggle = document.getElementById("settingsToggle");
  const panel = document.getElementById("settingsPanel");
  const isExpanded = toggle.classList.toggle("expand");
  panel.style.display = isExpanded ? "block" : "none";
  toggle.querySelector(".chevron").textContent = isExpanded ? "▼" : "▶";
};

// Test backend health status
async function testConnection() {
  const statusEl = document.getElementById("connectionStatus");
  statusEl.textContent = "Connecting...";
  statusEl.className = "server-status";

  try {
    const response = await fetch(`${currentServerUrl}/api/db-status`);
    if (response.ok) {
      statusEl.textContent = "● Server Connected";
      statusEl.className = "server-status status-online";
      loadContainers();
    } else {
      throw new Error();
    }
  } catch (err) {
    statusEl.textContent = "▲ Offline (Check Settings)";
    statusEl.className = "server-status status-offline";
    populateFallbackDropdown();
  }
}

// Save customized server host configuration
function saveServerSettings() {
  const inputUrl = document.getElementById("serverUrlInput").value.trim().replace(/\/$/, "");
  if (!inputUrl) return;

  chrome.storage.local.set({ serverUrl: inputUrl }, () => {
    currentServerUrl = inputUrl;
    testConnection();
    alert("Server URL updated successfully!");
    toggleSettings();
  });
}

// Fetch active Chrome browser tab details
function initActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tab = tabs[0];
    activeTabUrl = tab.url;
    activeTabTitle = tab.title || "Untitled Video/Media";

    document.getElementById("activeUrlText").textContent = activeTabUrl;
    document.getElementById("tabTitle").textContent = activeTabTitle;

    detectPlatform(activeTabUrl);
  });
}

// Detect which visual platform matching scheme is active
function detectPlatform(url) {
  const normalized = url.toLowerCase();
  const badge = document.getElementById("platformBadge");
  const btnSave = document.getElementById("btnSaveClip");
  const chatInput = document.getElementById("chatInput");
  const chatSend = document.getElementById("chatSendButton");

  badge.className = "platform-badge";
  btnSave.disabled = false;
  chatInput.disabled = false;
  chatSend.disabled = false;

  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) {
    activePlatform = "YouTube";
    badge.textContent = "YouTube";
    badge.classList.add("badge-youtube");
  } else if (normalized.includes("tiktok.com")) {
    activePlatform = "TikTok";
    badge.textContent = "TikTok";
    badge.classList.add("badge-tiktok");
  } else if (normalized.includes("instagram.com")) {
    activePlatform = "Instagram";
    badge.textContent = "Instagram";
    badge.classList.add("badge-instagram");
  } else {
    activePlatform = "Web Resource";
    badge.textContent = "Web Link";
    badge.classList.add("badge-unsupported");
    document.getElementById("btnSaveClip").textContent = "Extract & Save Webpage";
  }
}

// Load containers to populate dropdown
async function loadContainers() {
  const selector = document.getElementById("containerSelector");
  try {
    const response = await fetch(`${currentServerUrl}/api/containers`);
    if (!response.ok) throw new Error();
    fetchedContainers = await response.json();

    selector.innerHTML = "";
    if (fetchedContainers.length === 0) {
      selector.innerHTML = `<option value="">-- No Containers Found, Create One First --</option>`;
      document.getElementById("btnSaveClip").disabled = true;
      return;
    }

    fetchedContainers.forEach(container => {
      const option = document.createElement("option");
      option.value = container.id;
      option.textContent = `${container.name} (${container.type === 'author' ? 'Creator Mentor' : 'Topic Expert'})`;
      selector.appendChild(option);
    });
    
    document.getElementById("btnSaveClip").disabled = false;
  } catch (err) {
    console.warn("Failed fetching containers:", err);
    populateFallbackDropdown();
  }
}

function populateFallbackDropdown() {
  const selector = document.getElementById("containerSelector");
  selector.innerHTML = `<option value="">Offline Mode (Configure Server to Load Containers)</option>`;
  document.getElementById("btnSaveClip").disabled = true;
}

// Extract subtitles and structured summaries, and save immediately
async function extractAndSaveClip() {
  const btn = document.getElementById("btnSaveClip");
  const selector = document.getElementById("containerSelector");
  const successBox = document.getElementById("successSaveBox");
  const selectedContainerId = selector.value;

  if (!selectedContainerId) {
    alert("Please select a target knowledge container first!");
    return;
  }

  btn.disabled = true;
  btn.textContent = "⌛ Crawling & Analyzing Voice...";
  successBox.style.display = "none";

  try {
    // Stage 1: Call Extract endpoints to obtain structured markdown
    const extractResponse = await fetch(`${currentServerUrl}/api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: activeTabUrl })
    });

    if (!extractResponse.ok) {
      const errorData = await extractResponse.json();
      throw new Error(errorData.error || "Failed to extract/scrape link subtitles.");
    }

    const { title, transcript } = await extractResponse.json();
    extractedTranscript = transcript; // cache locally for instant chat

    // Stage 2: Retrieve current containers, inject the new Clip, and synchronize
    const freshContainersResponse = await fetch(`${currentServerUrl}/api/containers`);
    let freshContainers = [];
    if (freshContainersResponse.ok) {
      freshContainers = await freshContainersResponse.json();
    } else {
      freshContainers = [...fetchedContainers];
    }

    const containerIndex = freshContainers.findIndex(c => c.id === selectedContainerId);
    if (containerIndex === -1) {
      throw new Error("Selected container was deleted or modified. Please reload.");
    }

    const targetContainer = freshContainers[containerIndex];
    if (!targetContainer.clips) targetContainer.clips = [];

    // Check if clip already exists
    const exists = targetContainer.clips.some(clip => clip.url === activeTabUrl);
    if (!exists) {
      const newClip = {
        id: "clip_" + Date.now() + Math.random().toString(36).substr(2, 9),
        title: title || activeTabTitle,
        url: activeTabUrl,
        platform: activePlatform,
        transcript: transcript,
        duration: "Unknown",
        author: activePlatform + " Synthesizer",
        createdAt: Date.now()
      };
      targetContainer.clips.push(newClip);
    } else {
      // Just update it
      const existingClip = targetContainer.clips.find(clip => clip.url === activeTabUrl);
      existingClip.title = title || activeTabTitle;
      existingClip.transcript = transcript;
    }

    // Push to server-side persistence using sync endpoint
    const syncResponse = await fetch(`${currentServerUrl}/api/containers/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ containers: freshContainers })
    });

    if (!syncResponse.ok) throw new Error("Sync failed with the cloud collection.");

    // Update state
    fetchedContainers = freshContainers;

    successBox.style.display = "block";
    successBox.textContent = `🎉 Saved Successfully to "${targetContainer.name}"! Complete summarized extraction synced with cloud database.`;
  } catch (err) {
    alert("Extraction Failed: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = activePlatform === "Web Resource" ? "Extract & Save Webpage" : "Extract & Save to Database";
  }
}

// Ask direct questions about the current video's transcript
async function askVideoQuestion() {
  const inputEl = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendButton");
  const chatMessages = document.getElementById("chatMessages");
  const question = inputEl.value.trim();

  if (!question) return;

  // Append user message to UI
  appendMessage("user", question);
  inputEl.value = "";
  inputEl.disabled = true;
  sendBtn.disabled = true;

  // Append temporary loading dot bubble
  const loadingBubble = appendMessage("bot", "Thinking... ⌛ Deep analyzing video timeline transcripts...");

  try {
    // Ensure we have analyzed the transcript of this active tab
    if (!extractedTranscript) {
      loadingBubble.textContent = "Obtaining video transcript for verification... (takes few seconds)";
      const extractResponse = await fetch(`${currentServerUrl}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: activeTabUrl })
      });

      if (!extractResponse.ok) {
        throw new Error("Could not index the transcript. Ensure video has valid dialogue or caption tracks.");
      }

      const { transcript } = await extractResponse.json();
      extractedTranscript = transcript;
    }

    loadingBubble.textContent = "Generating high-fidelity response...";

    // Call chat proxy to consult the exact transcript knowledge base
    const chatResponse = await fetch(`${currentServerUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: question }],
        clipsContent: extractedTranscript,
        containerType: "topic"
      })
    });

    if (!chatResponse.ok) {
      throw new Error("AI engine failed to structure answer.");
    }

    const { response } = await chatResponse.json();
    loadingBubble.textContent = response;
  } catch (err) {
    loadingBubble.textContent = "❌ Query Failed: " + err.message;
  } finally {
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// Helper to append chat messages
function appendMessage(sender, text) {
  const chatMessages = document.getElementById("chatMessages");
  const bubble = document.createElement("div");
  bubble.className = `msg ${sender}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

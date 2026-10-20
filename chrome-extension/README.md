# VideoExplainer Chrome Extension 🧠🚀

The **VideoExplainer Chrome Extension** is a companion browser add-on that empowers creators and learners to scrape, save, and ask AI detailed questions about any YouTube video, Instagram Reel, or TikTok post instantly, without ever leaving the active tab!

---

## ✨ Features & Capabilities

1. **Instant Video Q&A Grid**  
   Ask questions about the active YouTube video (e.g., *"What is the step mentioned at 3:15?"* or *"Summarize the third recommendation"*). The extension fetches the subtitle track, processes it, and queries Gemini inside the popup to answer your questions with perfect context alignment.

2. **Durable Database Sync**  
   Sync discovered videos directly into targeted containers (such as your designated Creator Mentor or Subject Matter Expert) stored in your cloud MongoDB Atlas database.

3. **Multi-Platform Native Parsing**  
   Optimized matching and crawler pipelines for **YouTube**, **TikTok**, and **Instagram Reels**.

---

## 🛠️ Installation Guide (Takes 30 seconds!)

Follow these simple steps to install the extension in Google Chrome:

1. **Obtain the project repository**  
   Clone the repository (`git clone <repo-url>`) or extract the project source files to your local drive.

2. **Go to Chrome Extensions configuration**  
   Open Google Chrome and navigate to:  
   `chrome://extensions/`

3. **Enable Developer Mode**  
   Toggle the **"Developer mode"** switch on in the upper-right corner of the Extensions page.

4. **Load the Unpacked Folder**  
   - Click **"Load unpacked"** in the top-left corner.
   - Browse to your extracted project folder, select the relative **`chrome-extension`** directory, and click **Open**.

5. **Pin & Launch!**  
   Click the puzzles/extension icon in the Google Chrome toolbar, locate **VideoExplainer Social Scraper & Chat**, and click the pin icon to place it next to your address bar!

---

## ⚙️ Configuration & Server Sync

By default, the extension connects to your running Dev environment backend. If you deploy your backend to **Render**, simply:
1. Open the extension popup, click on **Settings (⚙️)** at the bottom.
2. Input your Render web service URL (e.g., `https://your-app.onrender.com`).
3. Click **Save Server Configuration**. It will instantly connect and load your custom containers!

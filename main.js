// main.js
const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  LLModel,
  createCompletion,
  loadModel,
} = require('gpt4all');
require('dotenv').config();

let model; // LLModel instance
let chat;

function createWindow() {
  let win = new BrowserWindow({
    width: 800,
    height: 600,
    transparent: true,
    frame: false, // Remove window frame
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true, // Keep sandbox enabled for security
    },
  });

  win.loadFile('index.html');
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

// IPC Handlers

// 1. Get Desktop Sources
ipcMain.handle('get-desktop-sources', async (event, opts) => {
  const sources = await desktopCapturer.getSources(opts);
  return sources;
});

// 2. Save Video
ipcMain.handle('save-video', async (event, arrayBuffer) => {
  const filePath = path.join(__dirname, 'recordedVideo.webm');
  try {
    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(arrayBuffer);

    // Write the file
    await fs.promises.writeFile(filePath, buffer);
    return { success: true, filePath };
  } catch (error) {
    console.error('Error writing video file:', error);
    return { success: false, error: error.message };
  }
});

// 3. Send Video to Gemini API
ipcMain.handle('send-video-to-gemini-api', async (event, filePath) => {
  try {
    const fileManager = new GoogleAIFileManager(process.env.API_KEY);
    console.log('Initialized GoogleAIFileManager.');

    // Upload the video file
    const uploadResult = await fileManager.uploadFile(filePath, {
      mimeType: 'video/webm',
      displayName: path.basename(filePath),
    });
    console.log('Uploaded video file to GoogleAIFileManager.');

    // Delete the local video file
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting local video file:', err);
      } else {
        console.log('Local video file deleted successfully.');
      }
    });

    let file = await fileManager.getFile(uploadResult.file.name);
    console.log('Retrieved file status from GoogleAIFileManager.');

    // Wait for the file to be processed
    while (file.state === FileState.PROCESSING) {
      console.log('File is processing...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
      file = await fileManager.getFile(uploadResult.file.name);
    }

    if (file.state === FileState.FAILED) {
      console.error('Video processing failed on GoogleAIFileManager.');
      throw new Error('Video processing failed.');
    }

    console.log(
      `Uploaded file ${uploadResult.file.displayName} as: ${uploadResult.file.uri}`
    );

    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    console.log('Initialized GoogleGenerativeAI client.');

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('Retrieved Generative Model: gemini-1.5-flash');

    // Generate content using the uploaded video
    const result = await model.generateContent([
      'Transcribe and summarize the following video.',
      {
        fileData: {
          fileUri: uploadResult.file.uri,
          mimeType: uploadResult.file.mimeType,
        },
      },
    ]);
    console.log('Generated content using the uploaded video.');

    const transcriptionText = await result.response.text();
    console.log('Received transcription text.');
    console.log(transcriptionText);

    // Delete the file from Google AI File Manager
    await fileManager.deleteFile(uploadResult.file.name);
    console.log('Deleted video file from Google AI File Manager.');

    return { success: true, transcriptionText };
  } catch (error) {
    console.error('Error in sendVideoToGeminiAPI:', error);
    return { success: false, error: error.message };
  }
});

// 4. Initialize Chat
ipcMain.handle('initialize-chat', async (event, transcriptionText) => {
  try {
    console.log('Initializing GPT4All model.');

    // const modelPath = path.join(__dirname, 'models', 'replit-code-v1_5-3b-newbpe-q4_0');

    // Load the model
    model = await loadModel('mistral-7b-openorca.gguf2.Q4_0.gguf', {
      verbose: true,
      // Add other options if necessary
    });

    console.log('GPT4All model loaded.');

    // Set up the initial prompt with the transcription text
    const initialPrompt = `This is a description of a video the user sent to you: "${transcriptionText} *End of video description* Your purpose is to be help the user deal with difficult situations, or root out misinformation. Please respond to the user in a kind and helpful manner. And do it as if your a cool guy."`;

    // Store the initial prompt for later use
    // model.initialPrompt = initialPrompt;
    chat = await model.createChatSession();

    // Send initial prompt
    await createCompletion(chat, initialPrompt, {
      verbose: true,
      // Add other options if necessary
    });

    return { success: true };
  } catch (error) {
    console.error('Error in initializeChat:', error);
    return { success: false, error: error.message };
  }
});

// 5. Send Message to GPT4All
ipcMain.handle('send-message', async (event, userInput) => {
  try {
    // Construct the prompt using the initial prompt and user input
    // const prompt = `${model.initialPrompt} ${userInput}\nAssistant:`;

    // Generate completion
    const completion = await createCompletion(chat, userInput, {
      verbose: true,
      // Add other options if necessary
    });

    console.log('Received response from GPT4All model.');
    console.log(completion.choices[0].message);

    // Update the initial prompt with the new conversation
    // model.initialPrompt += ` ${userInput}\nAssistant: ${completion.message}\nUser:`;

    return { success: true, response: completion.choices[0].message.content };
  } catch (error) {
    console.error('Error in sendMessage:', error);
    return { success: false, error: error.message };
  }
});

// Optional Logging Handlers
ipcMain.on('log-info', (event, ...args) => {
  console.log('Renderer Log:', ...args);
});

ipcMain.on('log-error', (event, ...args) => {
  console.error('Renderer Error:', ...args);
});

// Clean up when the app is about to quit
app.on('before-quit', () => {
  if (model) {
    model.dispose();
    console.log('GPT4All model disposed.');
  }
});

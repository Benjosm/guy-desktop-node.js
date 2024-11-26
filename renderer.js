// renderer.js
const log = window.electronAPI.log;

let mediaRecorder;
let recordedChunks = [];

const recordBtn = document.getElementById('recordBtn');

log.info('renderer.js started.');

recordBtn.addEventListener('click', () => {
  if (recordBtn.textContent === 'Start Recording') {
    log.info('Start Recording button clicked.');
    startRecording().catch((error) => {
      log.error('Error starting recording:', error);
    });
  } else {
    log.info('Stop Recording button clicked.');
    stopRecording();
  }
});

async function startRecording() {
  try {
    const inputSources = await window.electronAPI.getDesktopSources({ types: ['screen'] });
    log.info('Retrieved input sources for screen recording.');

    const videoOptions = {
      mimeType: 'video/webm; codecs=vp9',
    };

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: inputSources[0].id,
        },
      },
    });
    log.info('Obtained media stream for screen recording.');

    mediaRecorder = new MediaRecorder(stream, videoOptions);

    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.start();
    log.info('MediaRecorder started.');

    recordBtn.textContent = 'Stop Recording';
  } catch (error) {
    log.error('Error in startRecording:', error);
  }
}

function stopRecording() {
  mediaRecorder.stop();
  log.info('MediaRecorder stopped.');
  recordBtn.textContent = 'Start Recording';
}

function handleDataAvailable(event) {
  if (event.data.size > 0) {
    recordedChunks.push(event.data);
    log.info('Data available from MediaRecorder, saving video.');
    saveVideo().catch((error) => {
      log.error('Error saving video:', error);
    });
  } else {
    log.warn('No data received in handleDataAvailable.');
  }
}

async function saveVideo() {
  try {
    const blob = new Blob(recordedChunks, {
      type: 'video/webm; codecs=vp9',
    });

    // Convert Blob to ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();

    // Send ArrayBuffer to main process
    const result = await window.electronAPI.saveVideo(arrayBuffer);

    if (result.success) {
      log.info('Video saved successfully at', result.filePath);

      const geminiResult = await window.electronAPI.sendVideoToGeminiAPI(result.filePath);

      if (geminiResult.success) {
        log.info('Received transcription text.');
        switchToChatInterface(geminiResult.transcriptionText);
      } else {
        log.error('Error in sendVideoToGeminiAPI:', geminiResult.error);
      }
    } else {
      log.error('Error saving video:', result.error);
    }
  } catch (error) {
    log.error('Error in saveVideo:', error);
  }
}

document.getElementById('chatBtn').addEventListener('click', () => {
  switchToChatInterface('There is no transcription for this conversation.');
});

function switchToChatInterface(transcriptionText) {
  try {
    document.getElementById('recordingInterface').style.display = 'none';
    document.getElementById('chatInterface').style.display = 'block';

    // Initialize chat with transcription text
    log.info('Switching to chat interface with transcription text.');
    initializeChat(transcriptionText).catch((error) => {
      log.error('Error initializing chat:', error);
    });
  } catch (error) {
    log.error('Error in switchToChatInterface:', error);
  }
}

async function initializeChat(transcriptionText) {
  try {
    log.info('Initializing GPT4All model.');

    const initResult = await window.electronAPI.initializeChat(transcriptionText);

    if (initResult.success) {
      log.info('GPT4All model initialized and opened.');
    } else {
      log.error('Error in initializeChat:', initResult.error);
    }
  } catch (error) {
    log.error('Error in initializeChat:', error);
  }
}

document.getElementById('sendBtn').addEventListener('click', () => {
  sendMessage().catch((error) => {
    log.error('Error sending message:', error);
  });
});

async function sendMessage() {
  try {
    const userInput = document.getElementById('userInput').value;
    document.getElementById('userInput').value = '';

    // Display user message
    appendMessage('User', userInput);

    // Get response from the model
    const responseResult = await window.electronAPI.sendMessageToGPT4All(userInput);

    if (responseResult.success) {
      log.info('Received response from GPT4All model.');

      // Display model response
      appendMessage('Assistant', responseResult.response);
    } else {
      log.error('Error in sendMessage:', responseResult.error);
    }
  } catch (error) {
    log.error('Error in sendMessage:', error);
  }
}

function appendMessage(sender, message) {
  try {
    const chatWindow = document.getElementById('chatWindow');
    const messageElement = document.createElement('div');
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatWindow.appendChild(messageElement);
    log.info(`Appended message from ${sender}.`);
  } catch (error) {
    log.error('Error in appendMessage:', error);
  }
}

window.addEventListener('error', (event) => {
  log.error('Uncaught error in renderer process:', event.error);
});

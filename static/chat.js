// Get logged-in username from URL
const urlParams = new URLSearchParams(window.location.search);
const clientId = urlParams.get("username") || "Unknown";
let socket;
let selectedUser = null;
let publicKeys = {}; // Store fetched public keys
let unreadMessages = {};
let clients = [];
let messageHistory = {};
let allUsers = []; // Store all users from search results
let filteredUsers = []; // Store filtered users based on search
let currentFileAttachment = null; // Store the current file attachment

let OQSModule;
OQS().then(function (module) {
  OQSModule = module;
  console.log("WebAssembly module loaded");
  logDebug("Kyber-768 lengths - Ciphertext:", OQSModule._get_kyber_768_ciphertext_length(),
           "Shared Secret:", OQSModule._get_kyber_768_shared_secret_length());
}).catch(error => {
  logDebug("Failed to load WebSocket module:", error);
});

function init() {
  connectWebSocket();
  updateWelcomeMessage();

  // By default, show the placeholder and hide the chat interface
  if (!selectedUser) {
    document.getElementById("chat-placeholder").style.display = "flex";
    document.getElementById("chat-interface").style.display = "none";
  }

  document.getElementById("send-button").addEventListener("click", sendMessage);
  document.getElementById("message-input").addEventListener("keypress", function (e) {
    if (e.key === "Enter") sendMessage();
  });
  
  // Add event listener for attachment button
  const attachmentButton = document.getElementById("attachment-button");
  const fileInput = document.getElementById("file-input");
  
  if (attachmentButton) {
    attachmentButton.addEventListener("click", function() {
      fileInput.click();
    });
  }
  
  // Add event listener for file selection
  if (fileInput) {
    fileInput.addEventListener("change", handleFileSelection);
  }
  
  // Add event listener for search input
  const searchInput = document.getElementById("user-search");
  if (searchInput) {
    searchInput.addEventListener("input", handleSearchInput);
    // Clear search when clicking outside
    document.addEventListener("click", function(e) {
      if (e.target !== searchInput && !e.target.closest("#search-results-container")) {
        searchInput.value = "";
        document.getElementById("search-results-container").style.display = "none";
      }
    });
  }

  // Add event listener for logout button
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", handleLogout);
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function connectWebSocket() {
  updateConnectionStatus("Connecting...");
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/${clientId}`;
  socket = new WebSocket(wsUrl );

  socket.addEventListener("open", function () {
    updateConnectionStatus("Connected");
    logDebug("WebSocket connection established");
  });

  socket.addEventListener("message", function (event) {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "connected_clients":
        clients = data.clients.filter((client) => client !== clientId);
        // Update lists to reflect online status changes
        updateUserList(clients);
        break;
      case "encrypted_message":
        handleEncryptedMessage(data);
        break;
      case "file_attachment_data":
        handleFileAttachmentData(data);
        break;
      case "error":
        displayError(data.message);
        break;
      case "debug_info":
        displayDebugInfo(data);
        break;
      default:
        logDebug("Unhandled message type:", data.type);
    }
  });

  socket.addEventListener("close", function () {
    updateConnectionStatus("Disconnected");
    logDebug("WebSocket connection closed");
    setTimeout(connectWebSocket, 3000);
  });

  socket.addEventListener("error", function (event) {
    updateConnectionStatus("Connection Error");
    logDebug("WebSocket error:", event);
    socket.close();
  });
}

function updateWelcomeMessage() {
  document.getElementById("current-username").textContent = "Welcome, " + clientId;
}

function updateConnectionStatus(status) {
  //document.getElementById("connection-status").textContent = status;
}

function updateUserList(onlineClients) {
  const userList = document.getElementById("user-list");
  const offlineList = document.getElementById("offline-list");
  
  // Clear both lists
  if (userList) userList.innerHTML = "";
  if (offlineList) offlineList.innerHTML = "";
  
  // Get all users we know about from message history
  let allKnownUsers = [];
  
  // Add all users from message history
  for (const username in messageHistory) {
    if (!allKnownUsers.includes(username)) {
      allKnownUsers.push(username);
    }
  }
  
  // Add online users that aren't already in the list
  onlineClients.forEach(username => {
    if (!allKnownUsers.includes(username)) {
      allKnownUsers.push(username);
    }
  });
  
  // Separate users into online and offline
  const onlineUsers = onlineClients;
  const offlineUsers = allKnownUsers.filter(username => 
    !onlineClients.includes(username) && username !== clientId
  );
  
  // Render online users
  if (userList) {
    onlineUsers.forEach(username => {
      if (username !== clientId) { // Don't show current user
        renderUserItem({username, isOnline: true}, userList);
      }
    });
    
    // Show message if no online users
    if (onlineUsers.length === 0 || (onlineUsers.length === 1 && onlineUsers[0] === clientId)) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "empty-list-message";
      emptyMessage.textContent = "No users online";
      emptyMessage.style.padding = "10px 15px";
      emptyMessage.style.color = "#757575";
      emptyMessage.style.fontStyle = "italic";
      emptyMessage.style.fontSize = "13px";
      userList.appendChild(emptyMessage);
    }
  }
  
  // Render offline users
  if (offlineList) {
    offlineUsers.forEach(username => {
      renderUserItem({username, isOnline: false}, offlineList);
    });
    
    // Show message if no offline users
    if (offlineUsers.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "empty-list-message";
      emptyMessage.textContent = "No users offline";
      emptyMessage.style.padding = "10px 15px";
      emptyMessage.style.color = "#757575";
      emptyMessage.style.fontStyle = "italic";
      emptyMessage.style.fontSize = "13px";
      offlineList.appendChild(emptyMessage);
    }
  }
}

function updateSearchResults(searchResults) {
  const searchResultsContainer = document.getElementById("search-results-container");
  const searchResultsList = document.getElementById("search-results-list");
  
  if (!searchResultsContainer || !searchResultsList) return;
  
  // Clear the list
  searchResultsList.innerHTML = "";
  
  if (searchResults.length === 0) {
    searchResultsContainer.style.display = "none";
    return;
  }
  
  // Show the container
  searchResultsContainer.style.display = "block";
  
  // Render each search result
  searchResults.forEach(user => {
    const isOnline = clients.includes(user.username);
    renderUserItem(
      {
        username: user.username,
        email: user.email,
        isOnline: isOnline
      }, 
      searchResultsList
    );
  });
}

// Helper function to render a user item
function renderUserItem(user, containerElement) {
  const userItem = document.createElement("div");
  userItem.className = "user-item";
  if (selectedUser === user.username) userItem.classList.add("selected");
  if (!user.isOnline) userItem.classList.add("offline");

  // Avatar with initials
  const avatarContainer = document.createElement("div");
  avatarContainer.className = "avatar-container";
  
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  const initials = user.username.substring(0, 2).toUpperCase();
  avatar.textContent = initials;
  avatarContainer.appendChild(avatar);
  
  // Status indicator
  const statusIndicator = document.createElement("div");
  statusIndicator.className = "status-indicator";
  avatarContainer.appendChild(statusIndicator);
  
  userItem.appendChild(avatarContainer);

  // User info (username and status/email)
  const userInfo = document.createElement("div");
  userInfo.className = "user-info";

  const usernameSpan = document.createElement("span");
  usernameSpan.className = "username";
  usernameSpan.textContent = user.username;
  userInfo.appendChild(usernameSpan);

  const statusSpan = document.createElement("span");
  statusSpan.className = "user-status";
  
  // Show email for search results or status for others
  if (user.email && containerElement.id === "search-results-list") {
    statusSpan.textContent = user.email;
  } else {
    statusSpan.textContent = user.isOnline ? "Active now" : "Offline";
  }
  
  userInfo.appendChild(statusSpan);
  userItem.appendChild(userInfo);

  // Unread messages badge
  if (unreadMessages[user.username] > 0 && selectedUser !== user.username) {
    const badge = document.createElement("div");
    badge.className = "unread-badge";
    badge.textContent = unreadMessages[user.username];
    userItem.appendChild(badge);
  }

  // Add click event for all users (both online and offline)
  userItem.addEventListener("click", () => {
    selectUser(user.username);
  });
  
  containerElement.appendChild(userItem);
}

async function fetchMessageHistory() {
  try {
    const response = await fetch(`/messages/${clientId}`);
    const data = await response.json();
    if (data.messages) {
      data.messages.forEach(msg => {
        const otherUser = msg.sender === clientId ? msg.recipient : msg.sender;
        if (!messageHistory[otherUser]) messageHistory[otherUser] = [];
        if (!messageHistory[otherUser].some(m => m.timestamp === msg.timestamp && m.sender === msg.sender)) {
          messageHistory[otherUser].push({
            sender: msg.sender,
            recipient: msg.recipient,
            content: msg.encryptedContent,
            isSent: msg.sender === clientId,
            timestamp: msg.timestamp,
            iv: msg.iv,
            encryptedAESKey: msg.encryptedAESKey,
            status: msg.status,
            fileAttachment: msg.fileAttachment // Add support for file attachments
          });
        }
      });
      logDebug("Message history updated:", messageHistory);
    }
  } catch (error) {
    displayError(`Failed to fetch message history: ${error.message}`);
  }
}

async function selectUser(user) {
  logDebug(`Selecting user: ${user}, current selectedUser: ${selectedUser}`);

  // Show chat interface and hide placeholder
  document.getElementById("chat-placeholder").style.display = "none";
  document.getElementById("chat-interface").style.display = "flex";

  const chatMessages = document.getElementById("chat-messages");

  // Clear messages only if switching to a different user
  if (selectedUser !== user) {
    selectedUser = user;
    unreadMessages[user] = 0;
    chatMessages.innerHTML = "";
  }

  // Update selected styling
  document.querySelectorAll(".user-item").forEach((item) => {
    item.classList.remove("selected");
    if (item.querySelector(".username").textContent === user) item.classList.add("selected");
  });

  // Update chat header
  document.getElementById("chat-title").textContent = user;
  
  // Update avatar in header
  const selectedUserAvatar = document.getElementById("selected-user-avatar");
  if (selectedUserAvatar) {
    const initials = user.substring(0, 2).toUpperCase();
    selectedUserAvatar.textContent = initials;
  }
  
  // Update status in header
  const chatStatus = document.getElementById("chat-status");
  if (chatStatus) {
    chatStatus.textContent = clients.includes(user) ? "Active now" : "Offline";
  }

  // Fetch message history if not already fetched or if we need to refresh
  await fetchMessageHistory();

  // Filter and decrypt messages for the selected user
  if (messageHistory[user]) {
    for (const msg of messageHistory[user]) {
      if ((msg.sender === user && msg.recipient === clientId) || 
          (msg.sender === clientId && msg.recipient === user)) {
        let displayContent;
        let fileAttachment = null;
        
        if (!msg.decryptedContent) {
          try {
            const iv = base64ToArrayBuffer(msg.iv);
            const encryptedContent = base64ToArrayBuffer(msg.content);
            const encryptedAESKey = base64ToArrayBuffer(msg.encryptedAESKey);
            const privateKeyBase64 = getUserItem(clientId, 'kyber_private_key');
            if (!privateKeyBase64) throw new Error("Kyber private key not found in localStorage");
            const privateKey = base64ToArrayBuffer(privateKeyBase64);
            const aesKey = await decryptWithKyber(encryptedAESKey, privateKey);
            displayContent = await decryptWithAES(encryptedContent, iv, aesKey);
            msg.decryptedContent = displayContent; // Store decrypted content for future use
            
            // Check if this is a file message and parse its content
            if (msg.fileAttachment) {
              try {
                const encryptedFileData = base64ToArrayBuffer(msg.fileAttachment.encryptedData);
                const fileIv = base64ToArrayBuffer(msg.fileAttachment.iv);
                const decryptedFileData = await decryptWithAES(encryptedFileData, fileIv, aesKey);
                
                fileAttachment = {
                  fileName: msg.fileAttachment.fileName,
                  fileType: msg.fileAttachment.fileType,
                  fileSize: msg.fileAttachment.fileSize,
                  data: decryptedFileData
                };
                
                msg.decryptedFileAttachment = fileAttachment;
              } catch (fileError) {
                displayError(`Failed to decrypt file attachment: ${fileError.message}`);
              }
            }
          } catch (error) {
            displayError(`Failed to decrypt message: ${error.message}`);
            continue;
          }
        } else {
          displayContent = msg.decryptedContent;
          if (msg.decryptedFileAttachment) {
            fileAttachment = msg.decryptedFileAttachment;
          }
        }
        
        displayMessage(msg.sender, displayContent, msg.isSent, msg.timestamp, fileAttachment);
      }
    }
  }

  // Fetch public key if not already fetched
  if (!publicKeys[user]) {
    await fetchPublicKey(user);
  } else {
    enableChat();
  }

  // Update lists to reflect selection
  updateUserList(clients);
}

async function fetchPublicKey(username) {
  logDebug(`Fetching public key for ${username}`);
  try {
    const response = await fetch(`/get_public_key/${username}`);
    if (response.ok) {
      const data = await response.json();
      const publicKey = base64ToArrayBuffer(data.public_key);
      publicKeys[username] = publicKey;
      logDebug(`Public key fetched for ${username}, length: ${publicKey.length}, first 10 bytes:`, publicKey.slice(0, 10));
      if (publicKey.length !== 1184) {
        throw new Error(`Invalid public key length: ${publicKey.length} (expected 1184 for Kyber-768)`);
      }
      enableChat();
    } else {
      const error = await response.json();
      displayError(`Failed to fetch public key: ${error.detail}`);
    }
  } catch (error) {
    displayError(`Error fetching public key: ${error.message}`);
  }
}

function enableChat() {
  document.getElementById("message-input").disabled = false;
  document.getElementById("send-button").disabled = false;
  document.getElementById("attachment-button").disabled = false;
  logDebug("Chat enabled");
}

function disableChat() {
  document.getElementById("message-input").disabled = true;
  document.getElementById("send-button").disabled = true;
  document.getElementById("attachment-button").disabled = true;
  logDebug("Chat disabled");
}

// Store incomplete file transfers
let pendingFileTransfers = {};

// Handle file attachment data for chunked transfers
async function handleFileAttachmentData(data) {
  try {
    const messageTimestamp = data.messageTimestamp;
    const sender = data.sender;
    const fileAttachment = data.fileAttachment;
    
    logDebug(`Received file attachment data from ${sender} for message sent at ${messageTimestamp}`);
    
    // Find the pending message in message history
    if (!messageHistory[sender]) {
      logDebug(`No message history for ${sender}`);
      return;
    }
    
    // Find the message this file attachment belongs to
    const message = messageHistory[sender].find(msg => 
      msg.timestamp === messageTimestamp && 
      msg.sender === sender && 
      msg.fileAttachmentFollowing
    );
    
    if (!message) {
      logDebug(`Could not find associated message for file attachment`);
      return;
    }
    
    // Now decode and decrypt the file
    try {
      const fileIv = base64ToArrayBuffer(fileAttachment.iv);
      const encryptedFileData = base64ToArrayBuffer(fileAttachment.encryptedData);
      
      // Get the AES key that was used for this message
      const encryptedAESKey = base64ToArrayBuffer(message.encryptedAESKey);
      const privateKeyBase64 = getUserItem(clientId, 'kyber_private_key');
      if (!privateKeyBase64) throw new Error("Kyber private key not found in localStorage");
      const privateKey = base64ToArrayBuffer(privateKeyBase64);
      
      // Decrypt the AES key and then the file
      const aesKey = await decryptWithKyber(encryptedAESKey, privateKey);
      const decryptedFileData = await decryptWithAES(encryptedFileData, fileIv, aesKey);
      
      // Create the completed file attachment object
      const completeFileAttachment = {
        fileName: fileAttachment.fileName,
        fileType: fileAttachment.fileType,
        fileSize: fileAttachment.fileSize,
        data: decryptedFileData
      };
      
      // Update the message with the complete file attachment
      message.fileAttachment = fileAttachment;
      message.decryptedFileAttachment = completeFileAttachment;
      delete message.fileAttachmentFollowing;
      
      // If this is the currently selected user, update the display
      if (selectedUser === sender) {
        // Find the message element in the DOM
        const messagesContainer = document.getElementById("chat-messages");
        const messageElements = Array.from(messagesContainer.children);
        const messageElement = messageElements.find(el => 
          el.dataset.timestamp === messageTimestamp && 
          el.dataset.sender === sender
        );
        
        if (messageElement) {
          // Add file attachment to existing message
          const messageContent = messageElement.querySelector(".message-content");
          
          // Create file attachment element
          const attachmentElement = createFileAttachmentElement(completeFileAttachment);
          
          // Add it to the message
          messageContent.appendChild(attachmentElement);
        }
      }
      
      logDebug(`Successfully processed file attachment for message at ${messageTimestamp}`);
    } catch (error) {
      displayError(`Failed to decrypt file attachment: ${error.message}`);
      logDebug("File decryption error details:", error.stack || error);
    }
  } catch (error) {
    displayError(`Error handling file attachment data: ${error.message}`);
    logDebug("Error details:", error.stack || error);
  }
}

// Create a file attachment element for display
function createFileAttachmentElement(fileAttachment) {
  const container = document.createElement("div");
  
  const attachmentElement = document.createElement("div");
  attachmentElement.className = "message-attachment";
  
  // Choose icon based on file type
  const iconElement = document.createElement("i");
  let isImage = false;
  
  if (fileAttachment.fileType && fileAttachment.fileType.startsWith("image/")) {
    iconElement.className = "fas fa-image";
    isImage = true;
  } else if (fileAttachment.fileType && fileAttachment.fileType.startsWith("video/")) {
    iconElement.className = "fas fa-video";
  } else if (fileAttachment.fileType && fileAttachment.fileType.startsWith("audio/")) {
    iconElement.className = "fas fa-music";
  } else if (fileAttachment.fileType === "application/pdf") {
    iconElement.className = "fas fa-file-pdf";
  } else if (fileAttachment.fileType && fileAttachment.fileType.includes("word")) {
    iconElement.className = "fas fa-file-word";
  } else if (fileAttachment.fileType && fileAttachment.fileType.includes("excel")) {
    iconElement.className = "fas fa-file-excel";
  } else if (fileAttachment.fileType && fileAttachment.fileType.includes("zip")) {
    iconElement.className = "fas fa-file-archive";
  } else if (fileAttachment.fileType && fileAttachment.fileType.includes("text")) {
    iconElement.className = "fas fa-file-alt";
  } else {
    iconElement.className = "fas fa-file";
  }
  
  attachmentElement.appendChild(iconElement);
  
  // File info
  const fileInfo = document.createElement("div");
  fileInfo.className = "message-attachment-info";
  
  const fileName = document.createElement("div");
  fileName.className = "message-attachment-name";
  fileName.textContent = fileAttachment.fileName;
  fileInfo.appendChild(fileName);
  
  const fileSize = document.createElement("div");
  fileSize.className = "message-attachment-size";
  fileSize.textContent = formatFileSize(fileAttachment.fileSize);
  fileInfo.appendChild(fileSize);
  
  attachmentElement.appendChild(fileInfo);
  
  // If this is an image and we have the data, create a preview
  if (isImage && fileAttachment.data) {
    try {
      const blob = new Blob([fileAttachment.data], { type: fileAttachment.fileType });
      const imageUrl = URL.createObjectURL(blob);
      
      // Create image preview
      const imagePreview = document.createElement("div");
      imagePreview.className = "message-attachment-preview";
      
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = fileAttachment.fileName;
      
      // Add click handler to open full image
      image.addEventListener("click", () => {
        window.open(imageUrl, "_blank");
      });
      
      imagePreview.appendChild(image);
      attachmentElement.appendChild(imagePreview);
    } catch (error) {
      console.error("Failed to create image preview:", error);
    }
  }
  
  // Download button
  if (fileAttachment.data) {
    const downloadButton = document.createElement("div");
    downloadButton.className = "message-attachment-download";
    downloadButton.innerHTML = '<i class="fas fa-download"></i>';
    
    downloadButton.addEventListener("click", () => {
      try {
        const blob = new Blob([fileAttachment.data], { type: fileAttachment.fileType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileAttachment.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        displayError(`Failed to download file: ${error.message}`);
      }
    });
    
    attachmentElement.appendChild(downloadButton);
  }
  
  return attachmentElement;
}

// Handle file selection
function handleFileSelection(event) {
  const file = event.target.files[0];
  if (!file) return;

  removePreviewOnly();
  
  // Check file size (10MB max)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    displayError(`File is too large. Maximum size is 10MB.`);
    event.target.value = null; // Clear file input
    return;
  }
  
  // Store the file for later use
  currentFileAttachment = file;
  
  // Display file preview in chat input area
  displayFileAttachmentPreview(file);
  
  logDebug(`File selected: ${file.name} (${formatFileSize(file.size)})`);
}

// Display file attachment preview
function displayFileAttachmentPreview(file) {
  const chatInputContainer = document.querySelector('.chat-input-container');
  
  // Create preview element
  const previewContainer = document.createElement('div');
  previewContainer.id = 'attachment-preview-container';
  previewContainer.className = 'attachment-preview';
  
  // Add file icon based on type
  const fileIcon = document.createElement('i');
  fileIcon.className = 'attachment-preview-icon';
  
  if (file.type.startsWith('image/')) {
    fileIcon.className += ' fas fa-image';
  } else if (file.type.startsWith('video/')) {
    fileIcon.className += ' fas fa-video';
  } else if (file.type.startsWith('audio/')) {
    fileIcon.className += ' fas fa-music';
  } else if (file.type === 'application/pdf') {
    fileIcon.className += ' fas fa-file-pdf';
  } else if (file.type.includes('word') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    fileIcon.className += ' fas fa-file-word';
  } else if (file.type.includes('excel') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    fileIcon.className += ' fas fa-file-excel';
  } else if (file.type.includes('powerpoint') || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    fileIcon.className += ' fas fa-file-powerpoint';
  } else {
    fileIcon.className += ' fas fa-file';
  }
  
  // File name
  const fileName = document.createElement('div');
  fileName.className = 'attachment-preview-name';
  fileName.textContent = file.name + ' (' + formatFileSize(file.size) + ')';
  
  // Remove button
  const removeButton = document.createElement('div');
  removeButton.className = 'attachment-preview-remove';
  removeButton.innerHTML = '<i class="fas fa-times"></i>';
  removeButton.addEventListener('click', removeAttachment);
  
  // Assemble preview
  previewContainer.appendChild(fileIcon);
  previewContainer.appendChild(fileName);
  previewContainer.appendChild(removeButton);
  
  // Insert before input container
  chatInputContainer.parentNode.insertBefore(previewContainer, chatInputContainer);
}

function removePreviewOnly() {
  const preview = document.getElementById("attachment-preview-container");
  if (preview) preview.remove();
}

function removeAttachment() {
  removePreviewOnly();
  currentFileAttachment = null;
  hasFileAttachment = false;
  const fileInput = document.getElementById("file-input");
  if (fileInput) fileInput.value = "";
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return bytes + ' B';
  } else if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

async function sendMessage() {
  const input = document.getElementById("message-input");
  const message = input.value.trim();
  
  // Check if we have something to send (either text message or file attachment)
  if ((!message && !currentFileAttachment) || !selectedUser || !publicKeys[selectedUser]) {
    if (!publicKeys[selectedUser]) {
      displayError("Public key not available. Please try again.");
    }
    return;
  }
  
  try {
    const timestamp = new Date().toISOString();
    const hasTextContent = message.length > 0;
    
    // Display the message immediately
    if (hasTextContent || currentFileAttachment) {
      displayMessage(
        clientId, 
        hasTextContent ? message : "", 
        true, 
        timestamp,
        currentFileAttachment ? {
          fileName: currentFileAttachment.name,
          fileType: currentFileAttachment.type,
          fileSize: currentFileAttachment.size
        } : null
      );
    }
    
    // Clear input
    input.value = "";
    
    // Prepare encryption for the recipient
    const { ciphertext, sharedSecret } = await encapsulateWithKyber(publicKeys[selectedUser]);
    const aesKey = await importAESKey(sharedSecret);
    
    // Create a base message object
    const messageData = {
      type: "encrypted_message",
      sender: clientId,
      recipient: selectedUser,
      timestamp: timestamp
    };
    
    // Handle file attachment if present
    let fileAttachmentData = null;
    
    if (currentFileAttachment) {
      try {
        const fileArrayBuffer = await readFileAsArrayBuffer(currentFileAttachment);
        const { iv: fileIv, encryptedContent: encryptedFileData } = await encryptWithAES(fileArrayBuffer, aesKey);
        
        logDebug("currentFileAttachment", currentFileAttachment);

        fileAttachmentData = {
          fileName: currentFileAttachment.name,
          fileType: currentFileAttachment.type,
          fileSize: currentFileAttachment.size,
          iv: arrayBufferToBase64(fileIv),
          encryptedData: arrayBufferToBase64(encryptedFileData)
        };

        logDebug("File attachment data:", fileAttachmentData);
        
        // Remove file preview after sending
        removeAttachment();
      } catch (fileError) {
        logDebug(`Failed to encrypt file: ${fileError.message}`);
        return;
      }
    }
    
    // Encrypt the text message
    const textContent = hasTextContent ? message : "";
    const { iv, encryptedContent } = await encryptWithAES(textContent, aesKey);
    
    // Add encryption data to message
    messageData.iv = arrayBufferToBase64(iv);
    messageData.encryptedContent = arrayBufferToBase64(encryptedContent);
    messageData.encryptedAESKey = arrayBufferToBase64(ciphertext);
    
    // Add file attachment if present
    if (fileAttachmentData) {
      messageData.fileAttachment = fileAttachmentData;
    }
    
    // Add to message history
    if (!messageHistory[selectedUser]) messageHistory[selectedUser] = [];
    messageHistory[selectedUser].push({
      sender: clientId,
      recipient: selectedUser,
      content: arrayBufferToBase64(encryptedContent),
      isSent: true,
      timestamp: timestamp,
      iv: arrayBufferToBase64(iv),
      encryptedAESKey: arrayBufferToBase64(ciphertext),
      fileAttachment: fileAttachmentData,
      status: clients.includes(selectedUser) ? "delivered" : "pending"
    });
    
    // Send message to server
    sendToServer(messageData);
    
    logDebug("Encrypted message sent:", {
      ivLength: iv.length,
      encryptedContentLength: encryptedContent.length,
      encryptedAESKeyLength: ciphertext.length,
      hasFileAttachment: !!fileAttachmentData,
      recipientOnline: clients.includes(selectedUser)
    });
  } catch (error) {
    displayError(`Failed to send message: ${error.message}`);
    logDebug("Send error details:", error.stack || error);
  }
}

// Read file as ArrayBuffer
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// Encrypt ArrayBuffer with AES
async function encryptWithAES(data, aesKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Standard 12 bytes for AES-GCM
  
  let encryptionData;
  if (typeof data === 'string') {
    // Text data
    encryptionData = new TextEncoder().encode(data);
  } else {
    // Binary data (ArrayBuffer)
    encryptionData = new Uint8Array(data);
  }
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encryptionData
  );
  
  return { iv, encryptedContent };
}

async function handleEncryptedMessage(data) {
  if (data.recipient !== clientId) return;

  try {
    logDebug("Received encrypted message:", {
      ivLength: data.iv?.length,
      encryptedContentLength: data.encryptedContent?.length,
      encryptedAESKeyLength: data.encryptedAESKey?.length,
      hasFileAttachment: !!data.fileAttachment,
      fileAttachmentFollowing: !!data.fileAttachmentFollowing
    });

    // Check if this is a file attachment indicator message
    if (data.fileAttachmentFollowing) {
      logDebug(`Received message indicating file attachment will follow: ${data.fileName} (${formatFileSize(data.fileSize)})`);
      
      // Add to message history with placeholder for the file attachment
      if (!messageHistory[data.sender]) {
        messageHistory[data.sender] = [];
      }
      
      // Create a message entry that will be completed when the file arrives
      messageHistory[data.sender].push({
        sender: data.sender,
        recipient: data.recipient,
        content: data.encryptedContent,
        decryptedContent: data.encryptedContent ? await decryptMessage(data) : `Receiving file: ${data.fileName}...`,
        isSent: false,
        timestamp: data.timestamp,
        iv: data.iv,
        encryptedAESKey: data.encryptedAESKey,
        fileAttachmentFollowing: true,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType
      });

      // Display the message with a "downloading" indicator
      if (selectedUser === data.sender) {
        displayMessage(
          data.sender, 
          `Receiving file: ${data.fileName}...`, 
          false, 
          data.timestamp, 
          {
            fileName: data.fileName,
            fileType: data.fileType,
            fileSize: data.fileSize,
            isLoading: true
          }
        );
      } else {
        unreadMessages[data.sender] = (unreadMessages[data.sender] || 0) + 1;
        updateUserList(clients);
      }
      
      return; // Exit early, we'll process the actual file when it arrives
    }
    
    // This is a normal message, potentially with an inline file attachment
    const messageText = await decryptMessage(data);
    
    // Handle file attachment if present
    let fileAttachment = null;
    if (data.fileAttachment) {
      try {
        const fileIv = base64ToArrayBuffer(data.fileAttachment.iv);
        const encryptedFileData = base64ToArrayBuffer(data.fileAttachment.encryptedData);
        
        // Get the AES key
        const iv = base64ToArrayBuffer(data.iv);
        const encryptedAESKey = base64ToArrayBuffer(data.encryptedAESKey);
        const privateKeyBase64 = getUserItem(clientId, 'kyber_private_key');
        if (!privateKeyBase64) throw new Error("Kyber private key not found in localStorage");
        const privateKey = base64ToArrayBuffer(privateKeyBase64);
        const aesKey = await decryptWithKyber(encryptedAESKey, privateKey);
        
        // Decrypt the file
        const decryptedFileData = await decryptWithAES(encryptedFileData, fileIv, aesKey);
        
        fileAttachment = {
          fileName: data.fileAttachment.fileName,
          fileType: data.fileAttachment.fileType,
          fileSize: data.fileAttachment.fileSize,
          data: decryptedFileData
        };
      } catch (fileError) {
        displayError(`Failed to decrypt file attachment: ${fileError.message}`);
      }
    }

    // Ensure messageHistory is initialized for the sender
    if (!messageHistory[data.sender]) {
      messageHistory[data.sender] = [];
    }

    // Avoid adding duplicate messages to history
    if (!messageHistory[data.sender].some(msg => 
      msg.sender === data.sender && 
      msg.timestamp === data.timestamp && 
      ((msg.content === data.encryptedContent) || (msg.decryptedContent === messageText))
    )) {
      messageHistory[data.sender].push({
        sender: data.sender,
        recipient: data.recipient,
        content: data.encryptedContent,
        decryptedContent: messageText,
        isSent: false,
        timestamp: data.timestamp,
        iv: data.iv,
        encryptedAESKey: data.encryptedAESKey,
        fileAttachment: data.fileAttachment,
        decryptedFileAttachment: fileAttachment
      });

      if (selectedUser === data.sender) {
        displayMessage(data.sender, messageText, false, data.timestamp, fileAttachment);
      } else {
        unreadMessages[data.sender] = (unreadMessages[data.sender] || 0) + 1;
        updateUserList(clients);
      }
    }

    logDebug("Message processed successfully");
  } catch (error) {
    displayError(`Failed to process encrypted message: ${error.message || error}`);
    logDebug("Processing error details:", error.stack || error);
  }
}

// Helper function to decrypt message content
async function decryptMessage(data) {
  if (!data.encryptedContent || !data.iv || !data.encryptedAESKey) {
    return data.plainContent || "";
  }
  
  const iv = base64ToArrayBuffer(data.iv);
  const encryptedContent = base64ToArrayBuffer(data.encryptedContent);
  const encryptedAESKey = base64ToArrayBuffer(data.encryptedAESKey);

  const privateKeyBase64 = getUserItem(clientId, 'kyber_private_key');
  if (!privateKeyBase64) throw new Error("Kyber private key not found in localStorage");
  const privateKey = base64ToArrayBuffer(privateKeyBase64);

  const aesKey = await decryptWithKyber(encryptedAESKey, privateKey);
  return await decryptWithAES(encryptedContent, iv, aesKey);
}

async function importAESKey(sharedSecret) {
  return await window.crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// AES key generation
async function generateAESKey() {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function encapsulateWithKyber(publicKey) {
  if (!OQSModule) throw new Error("OQS WebAssembly module not loaded");
  
  const ciphertextLength = OQSModule._get_kyber_768_ciphertext_length(); // 1088 bytes
  const sharedSecretLength = OQSModule._get_kyber_768_shared_secret_length(); // 32 bytes
  const ciphertext = new Uint8Array(ciphertextLength);
  const sharedSecret = new Uint8Array(sharedSecretLength);

  const result = OQSModule._kyber_encapsulate(ciphertext, sharedSecret, publicKey);
  logDebug("Kyber encapsulate result:", result);
  if (result !== 0) throw new Error("Kyber encapsulation failed");

  return { ciphertext, sharedSecret };
}

// Kyber encryption
async function encryptWithKyber(aesKey, publicKey) {
  const exportedKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const keyBuffer = new Uint8Array(exportedKey);
  const ciphertextLength = OQSModule._get_kyber_768_ciphertext_length();
  const sharedSecretLength = OQSModule._get_kyber_768_shared_secret_length();
  const ciphertext = new Uint8Array(ciphertextLength);
  const sharedSecret = new Uint8Array(sharedSecretLength);

  OQSModule._kyber_encapsulate(ciphertext, sharedSecret, publicKey);
  return ciphertext; // C2
}

// Kyber decryption
async function decryptWithKyber(encryptedAESKey, privateKey) {
  const sharedSecretLength = OQSModule._get_kyber_768_shared_secret_length();
  const sharedSecret = new Uint8Array(sharedSecretLength);

  const result = OQSModule._kyber_decapsulate(sharedSecret, encryptedAESKey, privateKey);
  if (result !== 0) throw new Error("Kyber decapsulation failed");

  return await window.crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

// AES decryption
async function decryptWithAES(encryptedContent, iv, aesKey) {
  const decryptedContent = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encryptedContent
  );
  
  // If this is a text message, decode as text
  if (typeof encryptedContent === 'string' || encryptedContent instanceof Uint8Array) {
    try {
      return new TextDecoder().decode(decryptedContent);
    } catch (e) {
      // If it fails to decode as text, return the raw ArrayBuffer
      return decryptedContent;
    }
  }
  
  // Return raw ArrayBuffer for binary data
  return decryptedContent;
}

function displayMessage(sender, content, isSent, timestamp = new Date().toISOString(), fileAttachment = null) {
  if (sender !== selectedUser && sender !== clientId) return;

  const chatMessages = document.getElementById("chat-messages");

  // Check if message already exists in DOM to prevent duplicates
  const existingMessage = Array.from(chatMessages.children).some(child => 
    child.dataset.sender === sender && 
    child.dataset.timestamp === timestamp &&
    child.querySelector(".message").textContent === content &&
    // Allow updating messages with file attachments that were pending
    !(fileAttachment && !fileAttachment.isLoading && child.querySelector(".message-attachment.loading"))
  );

  if (existingMessage) return;

  // Check if this is an update to an existing message with a loading attachment
  let messageContainer;
  if (fileAttachment && !fileAttachment.isLoading) {
    const existingContainer = Array.from(chatMessages.children).find(child => 
      child.dataset.sender === sender && 
      child.dataset.timestamp === timestamp &&
      child.querySelector(".message-attachment.loading")
    );
    
    if (existingContainer) {
      // Update existing message with file attachment
      messageContainer = existingContainer;
      const loadingAttachment = messageContainer.querySelector(".message-attachment.loading");
      if (loadingAttachment) {
        // Replace loading indicator with actual file attachment
        const messageContent = messageContainer.querySelector(".message-content");
        loadingAttachment.remove();
        
        // Update the message text if it was a "Receiving file..." placeholder
        const messageElement = messageContainer.querySelector(".message");
        if (messageElement.textContent.startsWith("Receiving file:")) {
          messageElement.textContent = content;
        }
        
        // Add the file attachment
        const attachmentElement = createFileAttachmentElement(fileAttachment);
        messageContent.appendChild(attachmentElement);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
      }
    }
  }
  
  // Create new message if we're not updating an existing one
  if (!messageContainer) {
    messageContainer = document.createElement("div");
    messageContainer.className = `message-container ${isSent ? "sent" : "received"}`;
    messageContainer.dataset.sender = sender;
    messageContainer.dataset.timestamp = timestamp;

    // Avatar with initials
    const messageAvatar = document.createElement("div");
    messageAvatar.className = "message-avatar";
    const initials = sender.substring(0, 2).toUpperCase();
    messageAvatar.textContent = initials;

    // Message content container
    const messageContent = document.createElement("div");
    messageContent.className = "message-content";

    // Message bubble
    if (content != "") {
      const messageElement = document.createElement("div");
      messageElement.className = `message ${isSent ? "message-sent" : "message-received"}`;
      
      if (fileAttachment) {
        messageElement.style.marginBottom = "5px";
      }

      messageElement.textContent = content;
      messageContent.appendChild(messageElement);
    }
    
    // Add file attachment if present
    if (fileAttachment) {
      let attachmentElement;
      
      if (fileAttachment.isLoading) {
        // Show loading indicator for attachments being downloaded
        attachmentElement = document.createElement("div");
        attachmentElement.className = "message-attachment loading";
        
        // Loading spinner icon
        const iconElement = document.createElement("i");
        iconElement.className = "fas fa-circle-notch fa-spin";
        attachmentElement.appendChild(iconElement);
        
        // File info
        const fileInfo = document.createElement("div");
        fileInfo.className = "message-attachment-info";
        
        const fileName = document.createElement("div");
        fileName.className = "message-attachment-name";
        fileName.textContent = fileAttachment.fileName;
        fileInfo.appendChild(fileName);
        
        const fileSize = document.createElement("div");
        fileSize.className = "message-attachment-size";
        fileSize.textContent = formatFileSize(fileAttachment.fileSize);
        fileInfo.appendChild(fileSize);
        
        attachmentElement.appendChild(fileInfo);
      } else {
        // Regular file attachment display
        attachmentElement = createFileAttachmentElement(fileAttachment);
      }
      
      messageContent.appendChild(attachmentElement);
    }

    // Timestamp
    const messageTime = document.createElement("div");
    messageTime.className = "message-time";
    const date = new Date(timestamp);
    messageTime.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageContent.appendChild(messageTime);

    // Assemble the message
    messageContainer.appendChild(messageAvatar);
    messageContainer.appendChild(messageContent);

    chatMessages.appendChild(messageContainer);
  }
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function displayError(message) {
  logDebug("Error:", message);
  const chatMessages = document.getElementById("chat-messages");
  const errorElement = document.createElement("div");
  errorElement.className = "message";
  errorElement.style.backgroundColor = "#e74c3c";
  errorElement.style.color = "white";
  errorElement.textContent = `Error: ${message}`;
  chatMessages.appendChild(errorElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendToServer(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
    logDebug("Sent to server:", data);
  } else {
    logDebug("Socket not open, reconnecting...");
    connectWebSocket();
  }
}

function logDebug(...args) {
  console.log(...args);
  const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg)).join(" ");
  const logEntry = document.createElement("div");
  logEntry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
}

function requestDebugInfo() {
  sendToServer({ type: "debug_info_request" });
}

function displayDebugInfo(data) {
  logDebug("Debug info received:", data);
}

function clearDebugLog() {
  document.getElementById("debug-log").innerHTML = "";
}

function handleVisibilityChange() {
  if (!document.hidden && socket.readyState !== WebSocket.OPEN) {
    connectWebSocket();
  }
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// fetch users based on search query
async function searchUsers(query) {
  try {
    const response = await fetch(`/search_users?query=${encodeURIComponent(query)}`);
    if (response.ok) {
      const data = await response.json();
      allUsers = data.users;
      return allUsers;
    } else {
      const error = await response.json();
      displayError(`Failed to search users: ${error.detail}`);
      return [];
    }
  } catch (error) {
    displayError(`Error searching users: ${error.message}`);
    return [];
  }
}

// handle search input
async function handleSearchInput(e) {
  const query = e.target.value.trim();
  
  if (query.length >= 2) {
    // Search for users when query is at least 2 characters
    const results = await searchUsers(query);
    filteredUsers = results;
    updateSearchResults(filteredUsers);
  } else {
    // Hide search results when query is too short
    document.getElementById("search-results-container").style.display = "none";
  }
}

async function handleLogout() {
  try {
    // Close WebSocket connection
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    
    // Call logout endpoint
    const response = await fetch('/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Clear only current user's data from localStorage
    //clearUserStorage(clientId);
    
    // Redirect to login page
    window.location.href = "/static/index.html";
  } catch (error) {
    displayError(`Logout failed: ${error.message}`);
  }
}

// User-specific localStorage helper functions
function getUserKey(username, key) {
  return `user_${username}_${key}`;
}

function setUserItem(username, key, value) {
  localStorage.setItem(getUserKey(username, key), value);
}

function getUserItem(username, key) {
  return localStorage.getItem(getUserKey(username, key));
}

function removeUserItem(username, key) {
  localStorage.removeItem(getUserKey(username, key));
}

function clearUserStorage(username) {
  const userPrefix = `user_${username}_`;
  
  // Get all keys in localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    
    // Remove only keys that belong to this user
    if (key && key.startsWith(userPrefix)) {
      localStorage.removeItem(key);
    }
  }
}

window.addEventListener("load", init);

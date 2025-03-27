let socket;
let username;
let selectedRecipient = null;
let typingTimeout;
let chatHistory = {};
let userProfiles = {};
let peerConnection;
let localStream;
const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// DOM Elements
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('send-btn');
const chatBox = document.getElementById('chat-box');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');
const voiceBtn = document.getElementById('voice-btn');
const voiceCallBtn = document.querySelector('.voice-call');
const videoCallBtn = document.querySelector('.video-call');
const muteBtn = document.getElementById('mute-btn');
const endCallBtn = document.getElementById('end-call-btn');
const terminalText = document.querySelector('.terminal-loader .text');
const chatUsername = document.getElementById('chat-username');
const userProfilePic = document.getElementById('user-profile-pic');
const userStatus = document.getElementById('user-status');

// Emoji List
const emojis = ['😊', '😂', '❤️', '👍', '😍', '😢', '😡', '✨', '🎉', '🔥'];
let mediaRecorder;
let audioChunks = [];

// Populate Emoji Picker
emojis.forEach(emoji => {
    const span = document.createElement('span');
    span.classList.add('emoji');
    span.textContent = emoji;
    span.addEventListener('click', () => {
        messageInput.value += emoji;
        emojiPicker.style.display = 'none';
    });
    emojiPicker.appendChild(span);
});

// Terminal Loader Animation
terminalText.textContent = "Connecting...";

// Connect to WebSocket Server
function connectToServer() {
    username = document.getElementById("username").value.trim();
    if (username === "") {
        alert("Please enter a username.");
        return;
    }

    socket = new WebSocket("wss://chat-x-ver-1-0.onrender.com");

    socket.onopen = () => {
        socket.send(JSON.stringify({ type: "connect", username }));
        document.getElementById("user-login").style.display = "none";
        document.getElementById("chat-area").style.display = "flex";
        terminalText.textContent = "Connected!";
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
    
        if (data.type === "group-available") {
            const groupId = data.groupId;
            const groupName = data.groupName;
    
            // Save group icon and name
            userProfiles[groupId] = "group-icon.png";
    
            // Create chat history entry
            if (!chatHistory[groupId]) {
                chatHistory[groupId] = [];
            }
    
            // Render in user list
            const userContainer = document.getElementById("user-items-container");
            const groupElement = document.createElement("div");
            groupElement.classList.add("user-item");
            groupElement.innerHTML = `
                <img src="group-icon.png" class="list-profile-pic">
                <span>${groupName}</span>
            `;
            groupElement.onclick = () => selectRecipient(groupId, groupElement);
            userContainer.appendChild(groupElement);
        }
        
        else if (data.type === "message") {
            if (data.sender !== username) {
                storeMessage(data.sender, data.recipient, data.message, data.timestamp);
                terminalText.textContent = "New Message!";
            }
        } 
        
        else if (data.type === "updateUsers") {
            updateUserList(data.users);
            terminalText.textContent = "Users Updated!";
            if (selectedRecipient && data.users.includes(selectedRecipient)) {
                userStatus.style.background = '#00ff00'; // Online
            } else if (selectedRecipient) {
                userStatus.style.background = '#ff0000'; // Offline
            }
        }
    
        // ... other handlers like typing, seen, call-offer, etc.
    };
    
}
document.getElementById("create-group-btn").addEventListener("click", () => {
    const groupName = prompt("Enter a group name:");
    if (!groupName) return;

    const groupId = `group-${Date.now()}`; // unique ID
    const selectedUsers = prompt("Enter comma-separated usernames to add:")?.split(',').map(u => u.trim()).filter(Boolean);

    if (!selectedUsers || selectedUsers.length === 0) {
        alert("No users selected for the group.");
        return;
    }

    // Include yourself
    const groupMembers = [username, ...selectedUsers];
    chatHistory[groupId] = [];
    selectedRecipient = groupId;

    // Store in userProfiles to show as chat header
    userProfiles[groupId] = "group-icon.png"; // placeholder image
    chatUsername.textContent = groupName;
    userProfilePic.src = "group-icon.png";
    userStatus.style.background = "#eaff00";

    // Display it in the chat UI
    displayMessages(groupId);

    // Notify others about group chat (can be extended to backend)
    const infoMsg = `${groupName} group created with: ${groupMembers.join(', ')}`;
    storeMessage(username, groupId, infoMsg, new Date().toLocaleString());

    // Optionally send group creation data to server
    socket.send(JSON.stringify({
        type: "group-create",
        groupId,
        groupName,
        members: groupMembers
    }));
});


document.getElementById('user-search').addEventListener('input', function () {
    const searchTerm = this.value.toLowerCase();
    document.querySelectorAll('#user-items-container .user-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
    });
});


// Update User List
function updateUserList(users) {
    let userContainer = document.getElementById("user-items-container");
    userContainer.innerHTML = "";
    users.forEach(user => {
        if (user !== username) {
            let userElement = document.createElement("div");
            userElement.innerHTML = `
    <img src="${userProfiles[user] || 'default-profile-pic.jpg'}" class="list-profile-pic">
    <span>${user}</span>
`;

            userElement.classList.add("user-item");
            userElement.onclick = () => selectRecipient(user, userElement);
            userContainer.appendChild(userElement);
        }
    });
}


// Select Recipient
function selectRecipient(user, element) {
    selectedRecipient = user;
    document.querySelectorAll(".user-item").forEach(item => item.classList.remove("selected"));
    element.classList.add("selected");
    document.getElementById("typing-status").innerText = `Chatting with ${user}`;
    
    // Update User Header
    chatUsername.textContent = user;
    userProfilePic.src = userProfiles[user] || "default-profile-pic.jpg";
    userStatus.style.background = '#00ff00'; // Simulated online status
    displayMessages(user);
}

// Store and Display Messages
function storeMessage(sender, recipient, message, timestamp) {
    const chatKey = sender === username ? recipient : sender;
    if (!chatHistory[chatKey]) {
        chatHistory[chatKey] = [];
    }
    chatHistory[chatKey].push({ sender, message, timestamp });
    if (selectedRecipient === chatKey) {
        displayMessages(chatKey);
    }
}

function displayMessages(user) {
    chatBox.innerHTML = "";
    if (chatHistory[user]) {
        chatHistory[user].forEach(({ sender, message, timestamp }) => {
            let messageElement = document.createElement("div");
            messageElement.classList.add("chat-message", sender === username ? "sender" : "receiver");
            let img = document.createElement("img");
            img.src = userProfiles[sender] || "default-profile-pic.jpg";
            img.classList.add("profile-pic");
            let content = document.createElement("div");
            content.innerHTML = `<strong>${sender === username ? "You" : sender}:</strong> ${message} <br><small>${timestamp}</small>`;
            messageElement.appendChild(img);
            messageElement.appendChild(content);
            chatBox.appendChild(messageElement);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// Send Message
function sendMessage() {
    if (!selectedRecipient) {
        alert("Please select a user to chat with.");
        return;
    }
    const message = messageInput.value.trim();
    if (message === "") {
        alert("Message cannot be empty.");
        return;
    }
    const timestamp = new Date().toLocaleString();
    const messageData = { type: "message", sender: username, recipient: selectedRecipient, message, timestamp };
    storeMessage(username, selectedRecipient, message, timestamp);
    socket.send(JSON.stringify(messageData));
    messageInput.value = "";
    terminalText.textContent = "Message Sent!";
}

// Typing Indicator
messageInput.addEventListener('input', () => {
    if (selectedRecipient) {
        socket.send(JSON.stringify({ type: "typing", sender: username, recipient: selectedRecipient }));
    }
});

// Emoji Picker
emojiBtn.addEventListener('click', () => {
    emojiPicker.style.display = emojiPicker.style.display === 'block' ? 'none' : 'block';
});

document.addEventListener('click', (e) => {
    if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
        emojiPicker.style.display = 'none';
    }
});

// File Upload
fileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && selectedRecipient) {
        const fileUrl = URL.createObjectURL(file);
        const timestamp = new Date().toLocaleString();
        let message;
        if (file.type.startsWith('image/')) {
            message = `<img src="${fileUrl}" alt="Uploaded Image" style="max-width: 200px; border-radius: 10px;"><br><small>${timestamp}</small>`;
        } else {
            message = `<a href="${fileUrl}" download="${file.name}">${file.name}</a><br><small>${timestamp}</small>`;
        }
        const messageData = { type: "message", sender: username, recipient: selectedRecipient, message, timestamp };
        storeMessage(username, selectedRecipient, message, timestamp);
        socket.send(JSON.stringify(messageData));
        terminalText.textContent = "File Sent!";
    }
});

// Voice Recording
voiceBtn.addEventListener('mousedown', startRecording);
voiceBtn.addEventListener('mouseup', stopRecording);

function startRecording() {
    if (!selectedRecipient) return;
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            audioChunks = [];
            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            voiceBtn.style.background = '#ff4d4d';
            terminalText.textContent = "Recording...";
        })
        .catch(err => console.error('Error accessing microphone:', err));
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const timestamp = new Date().toLocaleString();
            const message = `<audio controls src="${audioUrl}"></audio><br><small>${timestamp}</small>`;
            const messageData = { type: "message", sender: username, recipient: selectedRecipient, message, timestamp };
            storeMessage(username, selectedRecipient, message, timestamp);
            socket.send(JSON.stringify(messageData));
            voiceBtn.style.background = '#1c2526';
            terminalText.textContent = "Voice Note Sent!";
        };
    }
}

// WebRTC Call Functions
voiceCallBtn.addEventListener('click', startVoiceCall);
videoCallBtn.addEventListener('click', startVideoCall);
muteBtn.addEventListener('click', toggleMute);
endCallBtn.addEventListener('click', endCall);

async function startVoiceCall() {
    if (!selectedRecipient) {
        alert("Please select a user before calling!");
        return;
    }
    await initiateCall(false);
    terminalText.textContent = "Voice Call Started!";
}

async function startVideoCall() {
    if (!selectedRecipient) {
        alert("Please select a user before calling!");
        return;
    }
    await initiateCall(true);
    terminalText.textContent = "Video Call Started!";
}

async function initiateCall(videoEnabled) {
    localStream = await navigator.mediaDevices.getUserMedia({ video: videoEnabled, audio: true });
    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    document.getElementById("video-call-box").style.display = "block";
    document.getElementById("localVideo").srcObject = localStream;

    peerConnection.ontrack = (event) => {
        document.getElementById("remoteVideo").srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.send(JSON.stringify({ type: "ice-candidate", candidate: event.candidate, recipient: selectedRecipient }));
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.send(JSON.stringify({ type: "call-offer", offer, sender: username, recipient: selectedRecipient }));
}

async function handleIncomingCall(data) {
    if (!confirm(`${data.sender} is calling you. Accept?`)) return;
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    document.getElementById("video-call-box").style.display = "block";
    document.getElementById("localVideo").srcObject = localStream;

    peerConnection.ontrack = (event) => {
        document.getElementById("remoteVideo").srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.send(JSON.stringify({ type: "ice-candidate", candidate: event.candidate, recipient: data.sender }));
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: "call-answer", answer, recipient: data.sender }));
}

function toggleMute() {
    if (localStream) {
        localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
        muteBtn.textContent = localStream.getAudioTracks()[0].enabled ? "🔇 Mute" : "🔊 Unmute";
        terminalText.textContent = localStream.getAudioTracks()[0].enabled ? "Unmuted!" : "Muted!";
    }
}

function endCall() {
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    document.getElementById("video-call-box").style.display = "none";
    terminalText.textContent = "Call Ended!";
}
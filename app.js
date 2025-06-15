class MoshiClient {
    constructor() {
        this.pc = null;
        this.localStream = null;
        this.audioContext = null;
        this.analyser = null;
        this.isConnected = false;
        this.moshiEndpoint = window.location.hostname === 'localhost' 
            ? 'http://localhost:8998/rtc'
            : 'https://moshi-app-njordr-6abf1041.koyeb.app/rtc';
        
        this.initializeUI();
        this.initializeAudioVisualization();
    }

    initializeUI() {
        this.connectBtn = document.getElementById('connect-btn');
        this.talkBtn = document.getElementById('talk-btn');
        this.statusEl = document.getElementById('connection-status');
        this.transcriptEl = document.getElementById('transcript');
        this.autoSpeakCheckbox = document.getElementById('auto-speak');
        
        this.connectBtn.addEventListener('click', () => this.toggleConnection());
        this.talkBtn.addEventListener('mousedown', () => this.startTalking());
        this.talkBtn.addEventListener('mouseup', () => this.stopTalking());
        this.talkBtn.addEventListener('mouseleave', () => this.stopTalking());
        
        // Touch events for mobile
        this.talkBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startTalking();
        });
        this.talkBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopTalking();
        });
    }

    initializeAudioVisualization() {
        const canvas = document.getElementById('audio-visualizer');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        this.canvasCtx = canvas.getContext('2d');
    }

    async toggleConnection() {
        if (this.isConnected) {
            this.disconnect();
        } else {
            await this.connect();
        }
    }

    async connect() {
        try {
            this.updateStatus('connecting', 'Connecting...');
            
            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            // Setup audio context for visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            this.analyser = this.audioContext.createAnalyser();
            source.connect(this.analyser);
            
            // Create peer connection
            this.pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            // Add local stream
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            // Handle remote stream
            this.pc.ontrack = (event) => {
                const audio = new Audio();
                audio.srcObject = event.streams[0];
                if (this.autoSpeakCheckbox.checked) {
                    audio.play();
                }
            };
            
            // Create and set offer
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            
            // Send offer to server
            const response = await fetch(this.moshiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'offer',
                    sdp: offer.sdp
                })
            });
            
            if (!response.ok) {
                const text = await response.text();
                console.error('Server response:', text);
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text);
                throw new Error('Server did not return JSON response');
            }
            
            const answer = await response.json();
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
            
            this.isConnected = true;
            this.updateStatus('connected', 'Connected');
            this.connectBtn.textContent = 'Disconnect';
            this.talkBtn.disabled = false;
            
            this.startVisualization();
            
        } catch (error) {
            console.error('Connection error:', error);
            this.updateStatus('disconnected', 'Failed to connect');
            alert('Failed to connect: ' + error.message);
        }
    }

    disconnect() {
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.isConnected = false;
        this.updateStatus('disconnected', 'Disconnected');
        this.connectBtn.textContent = 'Connect';
        this.talkBtn.disabled = true;
        this.stopVisualization();
    }

    startTalking() {
        if (!this.isConnected) return;
        this.talkBtn.classList.add('active');
        this.addTranscript('You', 'Speaking...', 'user');
    }

    stopTalking() {
        if (!this.isConnected) return;
        this.talkBtn.classList.remove('active');
    }

    updateStatus(status, text) {
        this.statusEl.className = `status ${status}`;
        this.statusEl.querySelector('.status-text').textContent = text;
    }

    addTranscript(speaker, text, type) {
        const entry = document.createElement('div');
        entry.className = `transcript-entry ${type}`;
        entry.innerHTML = `
            <div class="speaker">${speaker}</div>
            <div class="text">${text}</div>
        `;
        this.transcriptEl.appendChild(entry);
        this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    }

    startVisualization() {
        const draw = () => {
            if (!this.analyser) return;
            
            requestAnimationFrame(draw);
            
            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.analyser.getByteFrequencyData(dataArray);
            
            const canvas = this.canvasCtx.canvas;
            this.canvasCtx.fillStyle = 'rgba(10, 10, 10, 0.2)';
            this.canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                
                const gradient = this.canvasCtx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
                gradient.addColorStop(0, '#667eea');
                gradient.addColorStop(1, '#764ba2');
                
                this.canvasCtx.fillStyle = gradient;
                this.canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        };
        
        draw();
    }

    stopVisualization() {
        const canvas = this.canvasCtx.canvas;
        this.canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// Initialize the client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.moshiClient = new MoshiClient();
});

(function () {
    let recognition;
    let isListening = false;
    let activeBtn = null;
    let activeInput = null;
    let retryCount = 0;
    const maxRetries = 1; // automatic retry count for 'no-speech'
    const DEBUG = true;

    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech Recognition not supported in this browser.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // Prefer the browser/user language by default
    try {
        recognition.lang = (navigator.languages && navigator.languages[0]) || navigator.language || 'en-US';
    } catch (e) {
        recognition.lang = 'en-US';
    }

    recognition.onstart = () => {
        isListening = true;
        if (activeBtn) {
            activeBtn.classList.add('recording');
            activeBtn.innerHTML = '⏺';
        }
        updateStatus("Listening... Speak in any language.");
        if (DEBUG) console.debug('[voice] onstart, lang=', recognition.lang);
    };

    recognition.onaudiostart = () => {
        updateStatus("Microphone active — start speaking.");
    };

    recognition.onspeechstart = () => {
        updateStatus("Speech detected — processing...");
    };

    recognition.onspeechend = () => {
        updateStatus("Processing captured speech...");
    };

    recognition.onresult = async (event) => {
        if (DEBUG) console.debug('[voice] onresult', event);
        const transcript = event.results[0][0].transcript;

        // --- NEW LOGIC: Skip translation for Name field ---
        const isNameField = activeInput && (activeInput.id === 'username-input' || activeInput.name === 'username');

        if (isNameField) {
            if (activeInput) {
                activeInput.value = transcript;
                updateStatus("Name captured (no translation).");
            }
            retryCount = 0;
            return;
        }
        // --------------------------------------------------

        updateStatus("Translating to English...");

        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: transcript })
            });
            const data = await response.json();

            if (data.success && activeInput) {
                activeInput.value = data.translated_text;
                updateStatus("Translated to English!");

                // If it's the search input on the map page, trigger the search automatically
                if (activeInput.id === 'search-input' && typeof window.searchLocation === 'function') {
                    window.searchLocation();
                }
            } else if (activeInput) {
                activeInput.value = transcript;
                updateStatus("Done (Translation unavailable).");
            }
        } catch (err) {
            console.error("Translation error:", err);
            if (activeInput) activeInput.value = transcript;
            updateStatus("Done (Error).");
        }
        // reset retry counter after a successful result
        retryCount = 0;
    };

    recognition.onerror = (event) => {
        if (DEBUG) console.debug('[voice] onerror', event);
        console.error("Speech Recognition Error:", event.error);
        if (event.error === 'no-speech') {
            if (retryCount < maxRetries) {
                retryCount++;
                updateStatus('No speech detected — retrying...');
                try { recognition.stop(); } catch (e) { }
                setTimeout(() => {
                    try { recognition.start(); } catch (e) { updateStatus('Unable to restart recognition.'); stopState(); }
                }, 400);
                return;
            } else {
                updateStatus('No speech detected — please speak louder or check your microphone.');
            }
        } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            updateStatus('Microphone access denied. Please enable microphone permissions for this site.');
        } else if (event.error === 'network') {
            updateStatus('Network error during speech recognition. Try again.');
        } else {
            updateStatus('Error: ' + event.error);
        }
        stopState();
    };

    recognition.onend = () => {
        stopState();
    };

    function stopState() {
        isListening = false;
        if (activeBtn) {
            activeBtn.classList.remove('recording');
            activeBtn.innerHTML = '🎤';
        }
    }

    function updateStatus(msg) {
        const statusBox = document.getElementById('voice-status');
        if (statusBox) {
            statusBox.innerText = msg;
        } else {
            console.log("Voice Status:", msg);
        }
    }

    // Attach to all microphone buttons
    function attachListeners() {
        // Support various button patterns used in the project
        const selectors = [
            '#voice-btn',           // reviews.html
            '#voice-btn-login',     // login.html
            '#voice-btn-register',  // login.html
            '#voice-btn-search',    // navigation.html
            '[data-target]'          // generic with data-target
        ];

        document.querySelectorAll(selectors.join(',')).forEach(btn => {
            if (btn.dataset.voiceAttached) return;
            btn.dataset.voiceAttached = "true";

            btn.addEventListener('click', () => {
                if (isListening) {
                    recognition.stop();
                    return;
                }

                activeBtn = btn;
                retryCount = 0; // reset for each user-initiated session
                // Determine target input
                const targetId = btn.dataset.target || 'message-input';
                activeInput = document.getElementById(targetId);

                if (!activeInput && btn.id === 'voice-btn') {
                    activeInput = document.getElementById('message-input');
                }

                if (activeInput) {
                    // permission check where available
                    checkMicPermission().then(state => {
                        if (state === 'denied') {
                            updateStatus('Microphone permission denied. Please allow microphone access for this site.');
                            return;
                        }
                        if (DEBUG) console.debug('[voice] starting recognition');
                        try { recognition.start(); } catch (e) { console.error('Recognition start error', e); updateStatus('Unable to start recognition.'); }
                    }).catch(err => {
                        if (DEBUG) console.debug('[voice] permission check failed', err);
                        try { recognition.start(); } catch (e) { console.error('Recognition start error', e); updateStatus('Unable to start recognition.'); }
                    });
                } else {
                    console.error("No target input found for voice button", btn);
                }
            });
        });
    }

    // Try to check microphone permission state (may be unsupported in some browsers)
    function checkMicPermission() {
        return new Promise((resolve, reject) => {
            if (!navigator.permissions) return resolve(null);
            try {
                navigator.permissions.query({ name: 'microphone' }).then(res => resolve(res.state)).catch(() => resolve(null));
            } catch (e) { resolve(null); }
        });
    }

    // Run on load and also provide a global way to re-attach if needed
    window.addEventListener('load', attachListeners);
    window.refreshVoiceListeners = attachListeners;

    // Immediate check for dynamically loaded elements or if script loaded after DOM
    if (document.readyState === "complete" || document.readyState === "interactive") {
        attachListeners();
    }
})();

// Only run once
if (!window.loomTranscriptExtensionLoaded) {
  window.loomTranscriptExtensionLoaded = true;

  // Wait for video player to be ready
  const initTranscriptExtractor = () => {
    console.log('🔍 Loom Transcript Extractor: Waiting for video...');
    
    // Check if video exists
    let checkCount = 0;
    const checkVideo = setInterval(() => {
      checkCount++;
      const video = document.querySelector('video');
      
      if (video) {
        console.log('✅ Video found after', checkCount, 'attempts');
        clearInterval(checkVideo);
        // Wait for tracks to load
        setTimeout(() => {
          console.log('🎬 Creating transcript window...');
          createTranscriptWindow();
        }, 3000); // Give tracks more time to load
      } else if (checkCount % 10 === 0) {
        console.log('⏳ Still waiting for video... attempt', checkCount);
      }
    }, 1000);

    // Give it much longer in embedded context - 60 seconds
    setTimeout(() => {
      clearInterval(checkVideo);
      console.log('❌ Video not found after 60 seconds. Loom embed may not have loaded.');
    }, 60000);
  };

  const parseVTT = (vttText) => {
    const lines = vttText.split('\n');
    const transcript = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip WEBVTT header, timestamps, cue identifiers, and empty lines
      if (line && 
          !line.startsWith('WEBVTT') && 
          !line.includes('-->') && 
          !line.match(/^\d+$/) &&
          !line.startsWith('NOTE')) {
        // Remove any VTT tags like <v Speaker>
        const cleanLine = line.replace(/<[^>]*>/g, '');
        if (cleanLine) {
          transcript.push(cleanLine);
        }
      }
    }
    
    return transcript.join('\n\n');
  };

  const fetchFullTranscript = async () => {
    console.log('🎯 fetchFullTranscript: Starting...');
    
    // Wait for textTracks to be available
    let attempts = 0;
    while (attempts < 30) {  // Increased to 30 attempts = 15 seconds
      const video = document.querySelector('video');
      const textTracks = video?.textTracks;
      const trackCount = textTracks?.length || 0;
      
      console.log(`Attempt ${attempts + 1}: Video=${!!video}, TextTracks=${trackCount}`);
      
      if (textTracks && trackCount > 0) {
        // Find caption or subtitle track
        let captionTrack = null;
        for (let i = 0; i < trackCount; i++) {
          const track = textTracks[i];
          if (track.kind === 'captions' || track.kind === 'subtitles') {
            captionTrack = track;
            console.log(`✅ Found ${track.kind} track:`, track.label);
            break;
          }
        }
        
        if (captionTrack) {
          // Enable the track to access cues
          captionTrack.mode = 'hidden'; // 'hidden' loads cues without showing
          
          // Wait for cues to load
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          if (captionTrack.cues && captionTrack.cues.length > 0) {
            console.log(`📝 Found ${captionTrack.cues.length} cues`);
            
            // Extract text from cues
            const transcript = [];
            for (let i = 0; i < captionTrack.cues.length; i++) {
              const cue = captionTrack.cues[i];
              const text = cue.text.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
              if (text && !transcript.includes(text)) {
                transcript.push(text);
              }
            }
            
            console.log('✅ Transcript extracted, segments:', transcript.length);
            return transcript.join('\n\n');
          } else {
            console.log('⏳ Cues not loaded yet, waiting...');
          }
        }
      }
      
      // Wait 500ms before trying again
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    console.error('❌ No caption tracks found after 30 attempts (15 seconds)');
    throw new Error('No caption tracks found after waiting');
  };

  const createTranscriptWindow = () => {
    // Create a floating transcript window
    const transcriptWindow = document.createElement('div');
    transcriptWindow.id = 'loom-transcript-extractor';
    transcriptWindow.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; width: 450px; max-height: 650px; 
                  background: white; border: 2px solid #6663F6; border-radius: 12px; 
                  box-shadow: 0 8px 32px rgba(0,0,0,0.3); z-index: 999999; 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
                  display: flex; flex-direction: column;">
        <div id="transcript-header" style="background: linear-gradient(135deg, #6663F6, #97ACFD); 
                    color: white; padding: 15px; border-radius: 10px 10px 0 0; cursor: move; 
                    display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 16px;">📄 Transcript</strong>
          <div>
            <button id="minimizeBtn" style="background: rgba(255,255,255,0.3); border: none; 
                    color: white; padding: 5px 10px; border-radius: 5px; cursor: pointer; 
                    margin-right: 5px; font-weight: bold; font-size: 12px;">−</button>
            <button id="closeBtn" style="background: rgba(255,255,255,0.3); border: none; 
                    color: white; padding: 5px 10px; border-radius: 5px; cursor: pointer; 
                    font-weight: bold; font-size: 12px;">✖</button>
          </div>
        </div>
        <div id="transcript-body" style="flex: 1; display: flex; flex-direction: column;">
          <div style="padding: 12px; background: #f9f9ff; border-bottom: 1px solid #e0e0e0; display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="instantBtn" style="flex: 1; background: #6663F6; color: white; border: none; 
                    padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; 
                    font-size: 13px; transition: all 0.2s;">⚡ Get Full Transcript</button>
            <button id="liveBtn" style="flex: 1; background: white; color: #6663F6; border: 2px solid #6663F6; 
                    padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; 
                    font-size: 13px; transition: all 0.2s;">🎥 Live Capture</button>
          </div>
          <div style="padding: 10px 12px; background: #fffbea; border-bottom: 1px solid #f0e68c; 
                      font-size: 12px; color: #856404; text-align: center;" id="infoBox">
            Choose a mode to begin
          </div>
          <textarea id="transcriptText" readonly style="flex: 1; padding: 15px; border: none; 
                    font-size: 14px; line-height: 1.6; resize: none; overflow-y: auto; 
                    background: #f8f8f8; color: #333; min-height: 350px; font-family: inherit;"></textarea>
          <div style="padding: 10px; background: #f0f0f0; display: flex; gap: 8px; justify-content: space-between; align-items: center;">
            <div style="font-size: 12px; color: #666;">
              <span id="captionCount">Ready</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="copyBtn" disabled style="background: #e0e0e0; border: none; 
                      color: #999; padding: 6px 12px; border-radius: 5px; cursor: not-allowed; 
                      font-weight: bold; font-size: 11px;">📋 Copy</button>
              <button id="downloadBtn" disabled style="background: #e0e0e0; border: none; 
                      color: #999; padding: 6px 12px; border-radius: 5px; cursor: not-allowed; 
                      font-weight: bold; font-size: 11px;">💾 Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(transcriptWindow);

    // Make it draggable
    const header = document.getElementById('transcript-header');
    let isDragging = false;
    let currentX, currentY, initialX, initialY;

    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      initialX = e.clientX - transcriptWindow.offsetLeft;
      initialY = e.clientY - transcriptWindow.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        transcriptWindow.style.left = currentX + 'px';
        transcriptWindow.style.top = currentY + 'px';
        transcriptWindow.style.right = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Elements
    const textArea = document.getElementById('transcriptText');
    const captionCountEl = document.getElementById('captionCount');
    const infoBox = document.getElementById('infoBox');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const instantBtn = document.getElementById('instantBtn');
    const liveBtn = document.getElementById('liveBtn');
    
    let transcript = [];
    let isMinimized = false;
    let captureInterval = null;
    let currentMode = null;

    const enableButtons = () => {
      copyBtn.disabled = false;
      downloadBtn.disabled = false;
      copyBtn.style.background = '#6663F6';
      copyBtn.style.color = 'white';
      copyBtn.style.cursor = 'pointer';
      downloadBtn.style.background = '#6663F6';
      downloadBtn.style.color = 'white';
      downloadBtn.style.cursor = 'pointer';
    };

    const updateInfo = (message, type = 'info') => {
      const colors = {
        info: { bg: '#fffbea', border: '#f0e68c', text: '#856404' },
        success: { bg: '#d4edda', border: '#c3e6cb', text: '#155724' },
        error: { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24' },
        active: { bg: '#d1ecf1', border: '#bee5eb', text: '#0c5460' }
      };
      const color = colors[type] || colors.info;
      infoBox.style.background = color.bg;
      infoBox.style.borderColor = color.border;
      infoBox.style.color = color.text;
      infoBox.textContent = message;
    };

    // Instant Fetch Mode
    instantBtn.addEventListener('click', async () => {
      if (currentMode === 'instant') return;
      
      // Stop live capture if running
      if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
      }

      currentMode = 'instant';
      instantBtn.style.background = '#6663F6';
      instantBtn.style.color = 'white';
      liveBtn.style.background = 'white';
      liveBtn.style.color = '#6663F6';
      
      updateInfo('⏳ Fetching full transcript...', 'info');
      captionCountEl.textContent = 'Loading...';

      try {
        const fullTranscript = await fetchFullTranscript();
        transcript = fullTranscript.split('\n\n').filter(line => line.trim());
        textArea.value = fullTranscript;
        captionCountEl.textContent = `${transcript.length} segments • Instant mode`;
        updateInfo('✅ Full transcript loaded instantly!', 'success');
        enableButtons();
      } catch (error) {
        console.error('Error fetching transcript:', error);
        updateInfo('❌ Could not fetch transcript. Try Live Capture mode.', 'error');
        captionCountEl.textContent = 'Error';
      }
    });

    // Live Capture Mode
    liveBtn.addEventListener('click', () => {
      if (currentMode === 'live') return;

      currentMode = 'live';
      transcript = [];
      textArea.value = '';
      liveBtn.style.background = '#6663F6';
      liveBtn.style.color = 'white';
      instantBtn.style.background = 'white';
      instantBtn.style.color = '#6663F6';

      updateInfo('🎥 Capturing captions as video plays...', 'active');
      captionCountEl.textContent = '0 captions • Live mode';
      enableButtons();

      const video = document.querySelector('video');
      const textTracks = video?.textTracks;
      
      if (!textTracks || textTracks.length === 0) {
        updateInfo('❌ No caption tracks available for live capture', 'error');
        return;
      }
      
      // Find and enable caption track
      let captionTrack = null;
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        if (track.kind === 'captions' || track.kind === 'subtitles') {
          captionTrack = track;
          captionTrack.mode = 'hidden'; // Enable track without showing
          console.log('📺 Live capture enabled for:', track.label);
          break;
        }
      }
      
      if (!captionTrack) {
        updateInfo('❌ No caption tracks found', 'error');
        return;
      }

      captureInterval = setInterval(() => {
        const activeCues = captionTrack.activeCues;
        if (activeCues && activeCues.length > 0) {
          const cue = activeCues[0];
          const text = cue.text.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
          if (text && !transcript.includes(text)) {
            transcript.push(text);
            textArea.value = transcript.join('\n\n');
            captionCountEl.textContent = `${transcript.length} captions • Live mode`;
            textArea.scrollTop = textArea.scrollHeight;
          }
        }
      }, 500);
    });

    // Copy button
    copyBtn.addEventListener('click', () => {
      if (copyBtn.disabled) return;
      textArea.select();
      navigator.clipboard.writeText(textArea.value).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => copyBtn.textContent = originalText, 2000);
      });
    });

    // Download button
    downloadBtn.addEventListener('click', () => {
      if (downloadBtn.disabled) return;
      const videoTitle = document.querySelector('.css-mlocso')?.textContent || 'loom-video';
      const filename = `${videoTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-transcript.txt`;
      
      const blob = new Blob([textArea.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
      const originalText = downloadBtn.textContent;
      downloadBtn.textContent = '✅ Saved!';
      setTimeout(() => downloadBtn.textContent = originalText, 2000);
    });

    // Minimize button
    document.getElementById('minimizeBtn').addEventListener('click', () => {
      const body = document.getElementById('transcript-body');
      const btn = document.getElementById('minimizeBtn');
      if (isMinimized) {
        body.style.display = 'flex';
        btn.textContent = '−';
        isMinimized = false;
      } else {
        body.style.display = 'none';
        btn.textContent = '+';
        isMinimized = true;
      }
    });

    // Close button
    document.getElementById('closeBtn').addEventListener('click', () => {
      if (captureInterval) {
        clearInterval(captureInterval);
      }
      transcriptWindow.remove();
      window.loomTranscriptExtensionLoaded = false;
    });

    console.log('🚀 Loom Transcript Extractor loaded! Choose your mode.');
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTranscriptExtractor);
  } else {
    initTranscriptExtractor();
  }
}